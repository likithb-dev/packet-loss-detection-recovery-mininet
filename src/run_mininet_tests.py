#!/usr/bin/env python3
# run_mininet_tests.py
# Runs all our test cases inside Mininet, with real packet loss on the links,
# and saves the results to the results/ folder.
#
#   Test 1 - Different loss amounts : 0, 5, 10, 20 % on the main path (plain UDP vs our method)
#   Test 2 - Broken link            : cut s1-s2, measure detection and recovery time
#   Test 3 - Before vs after        : loss on the main path vs on the backup path
#   Test 4 - Our method vs TCP      : same 200 messages over the lossy main path
#
# Every test is run 3 times.
# Usage (Linux, Mininet installed):   sudo python3 run_mininet_tests.py
# (Test 5, the timeout test, runs on any laptop: python3 run_tests.py)

import csv
import json
import os
import re
import time

from mininet.log import setLogLevel

from mininet_reroute import build, use_primary, PathMonitor, use_backup

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")
TRIALS = 3
COUNT = 200
FIELDS = ["test", "setting", "mode", "trial", "expected", "received", "missing", "detected",
          "recovered", "duplicates", "transmissions", "retransmissions", "time"]


def result_line(text):
    for line in text.splitlines():
        if line.startswith("RESULT "):
            return json.loads(line[7:])
    raise RuntimeError("no RESULT line in output:\n" + text)


def run_udp(net, recovery=True):
    h1, h2 = net["h1"], net["h2"]
    h2.cmd(f"python3 {HERE}/udp_receiver.py --quiet > /tmp/recv.txt 2>&1 &")
    time.sleep(0.5)
    flag = "" if recovery else " --no-recovery"
    out = h1.cmd(f"python3 {HERE}/udp_sender.py --host 10.2.2.20 --count {COUNT} --quiet{flag}")
    h2.cmd("wait")                                   # wait for the receiver to finish
    r = result_line(open("/tmp/recv.txt").read())
    r.update(result_line(out))
    return r


def run_tcp(net):
    h1, h2 = net["h1"], net["h2"]
    h2.cmd(f"python3 {HERE}/tcp_receiver.py > /tmp/tcp_recv.txt 2>&1 &")
    time.sleep(0.5)
    h1.cmd(f"python3 {HERE}/tcp_sender.py --host 10.2.2.20 --count {COUNT}")
    h2.cmd("wait")
    r = result_line(open("/tmp/tcp_recv.txt").read())
    r.update({"expected": COUNT, "missing": COUNT - r["received"]})
    return r


def show(prefix, r):
    print(f"  {prefix} | delivered {r['received']}/{r['expected']} | missing {r['missing']:>2}"
          f" | resends {r.get('retransmissions', '-'):>3} | {r['time']:.2f} s")


def start_net(loss):
    net = build(loss)
    use_primary(net)
    net["h1"].cmd("ping -c 3 -W 1 10.2.2.20")         # warm up (ARP) before measuring
    return net


def test1(rows):
    print("=" * 70)
    print("TEST 1: Different loss amounts on the main path")
    print("=" * 70)
    for loss in [0, 5, 10, 20]:
        net = start_net(loss)
        try:
            for mode, recovery in [("plain UDP", False), ("our method", True)]:
                for t in range(1, TRIALS + 1):
                    r = run_udp(net, recovery)
                    rows.append({"test": "1_loss", "setting": loss, "mode": mode, "trial": t, **r})
                    show(f"loss {loss:>2}% | {mode:<10} | trial {t}", r)
        finally:
            net.stop()


def test2():
    print("=" * 70)
    print("TEST 2: Broken link - detection and recovery time")
    print("=" * 70)
    out = []
    for t in range(1, TRIALS + 1):
        net = start_net(0)
        try:
            h1 = net["h1"]
            h1.cmd("ping -D -i 0.05 10.2.2.20 > /tmp/ping.txt 2>&1 &")
            mon = PathMonitor(net)
            mon.start()
            time.sleep(3)
            fail_at = time.time()
            net.configLinkStatus("s1", "s2", "down")
            time.sleep(4)
            mon.running = False
            mon.join(2)
            h1.cmd("kill %ping")
            text = open("/tmp/ping.txt").read()
            stamps = [float(x) for x in re.findall(r"\[(\d+\.\d+)\] \d+ bytes from", text)]
            seqs = [int(x) for x in re.findall(r"icmp_seq=(\d+)", text)]
            gap = max(b - a for a, b in zip(stamps, stamps[1:]))
            det = (mon.detected_at - fail_at) * 1000 if mon.detected_at else float("nan")
            lost = (max(seqs) if seqs else 0) - len(stamps)
            out.append({"trial": t, "detection_ms": round(det), "recovery_ms": round(gap * 1000), "pings_lost": lost})
            print(f"  trial {t} | detection {det:.0f} ms | recovery {gap * 1000:.0f} ms | pings lost {lost}")
        finally:
            net.stop()
    return out


def test3_and_4(rows):
    print("=" * 70)
    print("TEST 3: Before vs after rerouting   +   TEST 4: Our method vs TCP")
    print("=" * 70)
    net = start_net(10)
    try:
        for t in range(1, TRIALS + 1):
            for mode, recovery in [("plain UDP", False), ("our method", True)]:
                r = run_udp(net, recovery)
                rows.append({"test": "3_before_after", "setting": "main", "mode": mode, "trial": t, **r})
                rows.append({"test": "4_tcp_vs_udp", "setting": "main", "mode": mode, "trial": t, **r})
                show(f"main path   | {mode:<10} | trial {t}", r)
            r = run_tcp(net)
            rows.append({"test": "4_tcp_vs_udp", "setting": "main", "mode": "TCP", "trial": t, **r})
            show(f"main path   | {'TCP':<10} | trial {t}", r)
        use_backup(net)                                # reroute: traffic now goes through s3
        net["h1"].cmd("ping -c 3 -W 1 10.2.2.20")
        for t in range(1, TRIALS + 1):
            for mode, recovery in [("plain UDP", False), ("our method", True)]:
                r = run_udp(net, recovery)
                rows.append({"test": "3_before_after", "setting": "backup", "mode": mode, "trial": t, **r})
                show(f"backup path | {mode:<10} | trial {t}", r)
    finally:
        net.stop()


def avg(rows, key):
    return sum(float(r[key]) for r in rows) / len(rows)


def summary(rows, fail):
    def sel(test, setting, mode):
        return [r for r in rows if r["test"] == test and r["setting"] == setting and r["mode"] == mode]

    print("\n\nFINAL RESULTS (average of 3 trials)\n")
    print("Test 1 - Packet loss vs delivery")
    print(f"{'Loss':>6} | {'Plain UDP delivered':>20} | {'Our method delivered':>21} | {'Resends':>8} | {'Time (s)':>8}")
    for loss in [0, 5, 10, 20]:
        p, o = sel("1_loss", loss, "plain UDP"), sel("1_loss", loss, "our method")
        print(f"{loss:>5}% | {100 * avg(p, 'received') / COUNT:>19.1f}% | {100 * avg(o, 'received') / COUNT:>20.1f}%"
              f" | {avg(o, 'retransmissions'):>8.1f} | {avg(o, 'time'):>8.2f}")

    print("\nTest 2 - Link failure")
    print(f"Detection time : {avg(fail, 'detection_ms'):.0f} ms (average)")
    print(f"Recovery time  : {avg(fail, 'recovery_ms'):.0f} ms (average)")
    print(f"Pings lost     : {avg(fail, 'pings_lost'):.1f} (average)")

    print("\nTest 3 - Before vs after rerouting")
    for setting, label in [("main", "Main path (10% loss)"), ("backup", "Backup path")]:
        p, o = sel("3_before_after", setting, "plain UDP"), sel("3_before_after", setting, "our method")
        print(f"{label:<22} | plain UDP lost {100 * avg(p, 'missing') / COUNT:.1f}% | our method resends {avg(o, 'retransmissions'):.1f}")

    print("\nTest 4 - Our method vs TCP (main path, 10% loss)")
    for mode in ["plain UDP", "our method", "TCP"]:
        x = sel("4_tcp_vs_udp", "main", mode)
        print(f"{mode:<11} | delivered {100 * avg(x, 'received') / COUNT:.1f}% | time {avg(x, 'time'):.2f} s")


def main():
    setLogLevel("warning")
    os.makedirs(RESULTS, exist_ok=True)
    rows = []
    test1(rows)
    fail = test2()
    test3_and_4(rows)

    with open(os.path.join(RESULTS, "mininet_results.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore", restval="")
        w.writeheader()
        w.writerows(rows)
    with open(os.path.join(RESULTS, "mininet_link_failure.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["trial", "detection_ms", "recovery_ms", "pings_lost"])
        w.writeheader()
        w.writerows(fail)

    summary(rows, fail)
    print(f"\nRaw results saved in {RESULTS}")
    try:
        import charts
        charts.make_all(RESULTS)
    except ImportError:
        print("Charts: copy the results/ folder to a laptop with matplotlib and run python3 charts.py")


if __name__ == "__main__":
    main()
