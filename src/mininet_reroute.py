#!/usr/bin/env python3
# mininet_reroute.py
# Topology with a main and a backup path, a path monitor, and
# dynamic rerouting when the main path fails or becomes too lossy.
#
#                     main path (loss on s1-s2)
#     h1 --- s1 ------- s2 ------- s4 --- h2
#  10.1.1.10                           10.2.2.20
#  Network A                           Network B
#             \                    /
#              \------- s3 -------/
#                   backup path
#
# Why each switch is there:
#   s1  h1's switch. Its flow rule decides main (port 2) or backup (port 3).
#   s2  the main route. Lets us test a switch failure, not only a cable failure.
#   s3  the backup route. Shares no cable or switch with the main route.
#   s4  h2's switch, where the two paths join. Its rule picks the path for ACKs.
#
# Run (Linux, Mininet installed):   sudo python3 mininet_reroute.py
# Options: --loss 10 (percent loss on primary link), --cli (open Mininet CLI at end)

import argparse
import os
import re
import subprocess
import threading
import time

from mininet.net import Mininet
from mininet.node import OVSSwitch
from mininet.link import TCLink
from mininet.log import setLogLevel

HERE = os.path.dirname(os.path.abspath(__file__))

def build(loss=10):
    net = Mininet(switch=OVSSwitch, link=TCLink, controller=None, autoSetMacs=True)
    # two different networks: Server A (h1) on Network A, Server B (h2) on Network B
    h1 = net.addHost("h1", ip="10.1.1.10/24")
    h2 = net.addHost("h2", ip="10.2.2.20/24")
    # failMode=secure: switches only forward using the rules we install
    s1, s2, s3, s4 = [net.addSwitch(f"s{i}", failMode="secure") for i in range(1, 5)]

    net.addLink(h1, s1, port2=1)
    net.addLink(h2, s4, port2=1)
    net.addLink(s1, s2, port1=2, port2=1, delay="5ms", loss=loss)  # main path
    net.addLink(s2, s4, port1=2, port2=2, delay="5ms")             # main path
    net.addLink(s1, s3, port1=3, port2=1, delay="10ms")            # backup path
    net.addLink(s3, s4, port1=2, port2=3, delay="10ms")            # backup path
    net.start()
    # each server reaches the other network through its switch (s1 / s4)
    h1.cmd("ip route add 10.2.2.0/24 dev h1-eth0")
    h2.cmd("ip route add 10.1.1.0/24 dev h2-eth0")
    return net


def flows(sw, rules):
    sw.cmd(f"ovs-ofctl del-flows {sw.name}")
    for r in rules:
        sw.cmd(f"ovs-ofctl add-flow {sw.name} {r}")


def use_primary(net):
    flows(net["s1"], ["in_port=1,actions=output:2", "in_port=2,actions=output:1", "in_port=3,actions=output:1"])
    flows(net["s4"], ["in_port=1,actions=output:2", "in_port=2,actions=output:1", "in_port=3,actions=output:1"])
    for sw in ("s2", "s3"):   # middle switches just pass packets through
        flows(net[sw], ["in_port=1,actions=output:2", "in_port=2,actions=output:1"])


def use_backup(net):
    flows(net["s1"], ["in_port=1,actions=output:3", "in_port=2,actions=output:1", "in_port=3,actions=output:1"])
    flows(net["s4"], ["in_port=1,actions=output:3", "in_port=2,actions=output:1", "in_port=3,actions=output:1"])


def fail_s2(net):
    """Switch s2 stops working: both of its cables go down."""
    net.configLinkStatus("s1", "s2", "down")
    net.configLinkStatus("s2", "s4", "down")


def udp_test(net, label):
    h1, h2 = net["h1"], net["h2"]
    print(f"\n--- UDP transfer test: {label} ---")
    h2.cmd(f"python3 {HERE}/udp_receiver.py > /tmp/recv_{label}.txt 2>&1 &")
    time.sleep(0.5)
    out = h1.cmd(f"python3 {HERE}/udp_sender.py --host 10.2.2.20 --count 200")
    time.sleep(0.5)
    print(out[out.find("====="):])
    print(open(f"/tmp/recv_{label}.txt").read().split("=====", 1)[-1])


class PathMonitor(threading.Thread):
    """Watches the primary link. Reroutes to the backup path if the link goes
    down or probe loss goes above a threshold."""

    def __init__(self, net, threshold=50):
        super().__init__(daemon=True)
        self.net, self.threshold = net, threshold
        self.detected_at = None
        self.running = True

    def link_up(self):
        # switch interfaces live in the main Linux namespace, so we can read them directly
        with open("/sys/class/net/s1-eth2/operstate") as f:
            return "up" in f.read()

    def probe_loss(self):
        # popen (not cmd) so this can run at the same time as other commands on h1
        p = self.net["h1"].popen(["ping", "-c", "20", "-i", "0.01", "-W", "0.2", "10.2.2.20"],
                                 stdout=subprocess.PIPE, universal_newlines=True)
        out = p.communicate()[0]
        m = re.search(r"(\d+(?:\.\d+)?)% packet loss", out)
        return float(m.group(1)) if m else 100.0

    def run(self):
        while self.running:
            if not self.link_up():
                reason = "primary link DOWN"
            elif self.probe_loss() > self.threshold:
                # the link may have gone down while the probe pings were running
                reason = "loss above threshold" if self.link_up() else "primary link DOWN"
            else:
                time.sleep(0.1)
                continue
            self.detected_at = time.time()
            print(f"[monitor] {reason} -> rerouting to backup path via s3")
            use_backup(self.net)
            return


def recovery_test(net):
    print("\n--- Link failure + rerouting test ---")
    h1 = net["h1"]
    h1.cmd("ping -D -i 0.05 10.2.2.20 > /tmp/ping.txt 2>&1 &")
    mon = PathMonitor(net)
    mon.start()
    time.sleep(3)

    fail_at = time.time()
    print("[test] breaking primary link s1-s2")
    net.configLinkStatus("s1", "s2", "down")
    time.sleep(4)
    mon.running = False
    mon.join(2)
    h1.cmd("kill %ping")

    # recovery time = longest gap between two successful ping replies
    stamps = [float(t) for t in re.findall(r"\[(\d+\.\d+)\] \d+ bytes from", open("/tmp/ping.txt").read())]
    gap = max(b - a for a, b in zip(stamps, stamps[1:])) if len(stamps) > 1 else float("nan")
    if mon.detected_at:
        print(f"Detection time          : {(mon.detected_at - fail_at) * 1000:.0f} ms")
    print(f"Recovery time (ping gap): {gap * 1000:.0f} ms")
    print(f"Ping replies received   : {len(stamps)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--loss", type=float, default=10)
    parser.add_argument("--cli", action="store_true")
    args = parser.parse_args()
    setLogLevel("warning")
    net = build(args.loss)
    try:
        use_primary(net)
        print(net["h1"].cmd("ping -c 3 10.2.2.20"))
        udp_test(net, "primary_lossy")       # before recovery
        recovery_test(net)                   # detect failure + reroute
        udp_test(net, "backup_path")         # after recovery
        if args.cli:
            from mininet.cli import CLI
            CLI(net)
    finally:
        net.stop()
