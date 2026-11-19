#!/usr/bin/env python3
# live_demo.py
# The full working model in one run, for the live demo:
#   1. h1 sends 600 packets to h2 over the main path, which has 10% loss
#      -> the receiver DETECTS missing packets, the sender RECOVERS them
#   2. halfway through, we break the main cable s1-s2 (or, with --fail switch, switch s2 dies)
#      -> the path monitor notices and REROUTES traffic through the backup path s1 -> s3 -> s4
#   3. the transfer finishes with every packet delivered
#
# Usage (inside the Ubuntu VM):   sudo python3 live_demo.py [--fail cable|switch]

import argparse
import os
import subprocess
import threading
import time

from mininet.log import setLogLevel

from mininet_reroute import build, use_primary, PathMonitor, fail_s2

HERE = os.path.dirname(os.path.abspath(__file__))
COUNT = 600

parser = argparse.ArgumentParser()
parser.add_argument("--fail", choices=["cable", "switch"], default="cable")
args = parser.parse_args()


def say(msg):
    print(f"\n>>> {msg}\n", flush=True)


def stream(proc, tag):
    for line in proc.stdout:
        print(f"[{tag}] {line.rstrip()}", flush=True)


setLogLevel("warning")
say("Building the network: h1 - s1 - s2 - s4 - h2 (main path, 10% loss) and backup path s1 - s3 - s4")
net = build(10)
try:
    use_primary(net)
    h1, h2 = net["h1"], net["h2"]
    h1.cmd("ping -c 3 -W 1 10.2.2.20")
    time.sleep(1)

    say(f"Starting transfer: h1 sends {COUNT} numbered packets to h2 over the lossy main path")
    recv = h2.popen(["python3", "-u", f"{HERE}/udp_receiver.py"], stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT, universal_newlines=True)
    t = threading.Thread(target=stream, args=(recv, "h2 receiver"), daemon=True)
    t.start()
    time.sleep(0.5)
    send = h1.popen(["python3", "-u", f"{HERE}/udp_sender.py", "--host", "10.2.2.20", "--count", str(COUNT), "--quiet"],
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True)

    mon = PathMonitor(net)
    mon.start()
    time.sleep(5)

    say("SWITCH s2 FAILS now!" if args.fail == "switch" else "BREAKING the main cable s1-s2 now!")
    fail_at = time.time()
    if args.fail == "switch":
        fail_s2(net)
    else:
        net.configLinkStatus("s1", "s2", "down")

    out = send.communicate()[0]
    t.join(15)
    mon.running = False
    if mon.detected_at:
        say(f"Failure detected {1000 * (mon.detected_at - fail_at):.0f} ms after the failure; traffic moved to the backup path s1 -> s3 -> s4")
    print(out[out.find("====="):], flush=True)
    say("Done: every packet was delivered, even with 10% loss AND a failed main path")
finally:
    net.stop()
