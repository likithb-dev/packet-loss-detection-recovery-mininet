# run_tests.py
# Runs our test cases on a normal laptop (no Mininet needed) and saves the results.
# Loss is simulated inside our programs: data packets AND ACKs are each dropped
# with the chosen probability.
#
#   Test 1 - Different loss amounts : 0, 5, 10, 20 %  (plain UDP vs our method)
#   Test 5 - Different wait times   : timeout 0.1, 0.2, 0.5 s at 10 % loss
#
# Every setting is run 3 times and averaged.
# Usage: python3 run_tests.py            (results go into the results/ folder)

import csv
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")
TRIALS = 3
COUNT = 200
PY = sys.executable

FIELDS = ["test", "setting", "mode", "trial", "expected", "received", "missing", "detected",
          "recovered", "duplicates", "transmissions", "retransmissions", "time"]


def result_line(text):
    for line in text.splitlines():
        if line.startswith("RESULT "):
            return json.loads(line[7:])
    raise RuntimeError("no RESULT line in output:\n" + text)


def run_once(loss, timeout=0.2, recovery=True, port=5000):
    """Start the receiver, run the sender, return the numbers from both."""
    recv = subprocess.Popen([PY, os.path.join(HERE, "udp_receiver.py"), "--port", str(port),
                             "--ack-loss", str(loss), "--quiet"],
                            stdout=subprocess.PIPE, text=True)
    time.sleep(0.3)
    cmd = [PY, os.path.join(HERE, "udp_sender.py"), "--port", str(port), "--count", str(COUNT),
           "--loss", str(loss), "--timeout", str(timeout), "--quiet"]
    if not recovery:
        cmd.append("--no-recovery")
    sender_out = subprocess.run(cmd, capture_output=True, text=True).stdout
    recv_out, _ = recv.communicate(timeout=30)
    r = result_line(recv_out)
    r.update(result_line(sender_out))
    return r


def avg(rows, key):
    return sum(float(r[key]) for r in rows) / len(rows)


def main():
    os.makedirs(RESULTS, exist_ok=True)
    rows = []

    print("=" * 70)
    print(f"TEST 1: Different loss amounts ({COUNT} packets, {TRIALS} trials each)")
    print("=" * 70)
    for loss in [0, 0.05, 0.10, 0.20]:
        for mode, recovery in [("plain UDP", False), ("our method", True)]:
            for t in range(1, TRIALS + 1):
                r = run_once(loss, recovery=recovery)
                rows.append({"test": "1_loss", "setting": int(loss * 100), "mode": mode, "trial": t, **r})
                print(f"  loss {int(loss * 100):>2}% | {mode:<10} | trial {t} | delivered {r['received']}/{r['expected']}"
                      f" | missing {r['missing']:>2} | resends {r['retransmissions']:>3} | {r['time']:.2f} s")

    print()
    print("=" * 70)
    print(f"TEST 5: Different wait times before resending (10% loss, {TRIALS} trials each)")
    print("=" * 70)
    for timeout in [0.1, 0.2, 0.5]:
        for t in range(1, TRIALS + 1):
            r = run_once(0.10, timeout=timeout)
            rows.append({"test": "5_timeout", "setting": timeout, "mode": "our method", "trial": t, **r})
            print(f"  timeout {timeout}s | trial {t} | delivered {r['received']}/{r['expected']}"
                  f" | resends {r['retransmissions']:>3} | duplicates {r['duplicates']:>2} | {r['time']:.2f} s")

    path = os.path.join(RESULTS, "local_results.csv")
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    # ---------- summary tables (averages of the trials) ----------
    print("\n\nFINAL RESULTS (average of 3 trials)\n")
    print("Test 1 - Packet loss vs delivery")
    print(f"{'Loss':>6} | {'Plain UDP delivered':>20} | {'Our method delivered':>21} | {'Resends':>8} | {'Time (s)':>8}")
    for loss in [0, 5, 10, 20]:
        p = [r for r in rows if r["test"] == "1_loss" and r["setting"] == loss and r["mode"] == "plain UDP"]
        o = [r for r in rows if r["test"] == "1_loss" and r["setting"] == loss and r["mode"] == "our method"]
        print(f"{loss:>5}% | {100 * avg(p, 'received') / COUNT:>19.1f}% | {100 * avg(o, 'received') / COUNT:>20.1f}%"
              f" | {avg(o, 'retransmissions'):>8.1f} | {avg(o, 'time'):>8.2f}")

    print("\nTest 5 - Timeout value (10% loss)")
    print(f"{'Timeout':>8} | {'Delivered':>9} | {'Resends':>8} | {'Duplicates':>10} | {'Time (s)':>8}")
    for timeout in [0.1, 0.2, 0.5]:
        o = [r for r in rows if r["test"] == "5_timeout" and r["setting"] == timeout]
        print(f"{timeout:>7}s | {100 * avg(o, 'received') / COUNT:>8.1f}% | {avg(o, 'retransmissions'):>8.1f}"
              f" | {avg(o, 'duplicates'):>10.1f} | {avg(o, 'time'):>8.2f}")

    print(f"\nRaw results saved to {path}")
    try:
        import charts
        charts.make_all(RESULTS)
    except ImportError:
        print("Install matplotlib (pip3 install matplotlib) and run: python3 charts.py   to draw the charts")


if __name__ == "__main__":
    main()
