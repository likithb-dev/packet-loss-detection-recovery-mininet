# udp_receiver.py
# Receives numbered UDP packets, detects missing ones using sequence numbers,
# and sends an ACK for every packet it gets.
#
# Usage: python3 udp_receiver.py [--port 5000] [--loss 0.1] [--ack-loss 0.1] [--quiet]
#   --loss      simulate packet loss at the receiver (0.1 = drop 10%), useful when
#               testing on a normal laptop without Mininet.
#   --ack-loss  simulate loss of the ACKs going back to the sender.
#   --quiet     don't print a line for every gap (used by the test scripts).

import socket
import argparse
import random
import time
import json

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=5000)
parser.add_argument("--loss", type=float, default=0.0)
parser.add_argument("--ack-loss", type=float, default=0.0)
parser.add_argument("--quiet", action="store_true")
args = parser.parse_args()

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
sock.bind(("0.0.0.0", args.port))
sock.settimeout(10)    # give up if the sender goes silent for 10 s
print(f"[receiver] listening on UDP port {args.port}")

received = set()       # sequence numbers we have got
highest = -1           # highest sequence number seen so far
missing_ever = set()   # every seq number we ever noticed was missing
duplicates = 0
dropped_sim = 0
start = None
total = None

while True:
    try:
        data, addr = sock.recvfrom(2048)
    except socket.timeout:
        print("[receiver] no packets for 10 s, stopping")
        break
    msg = data.decode()

    if msg.startswith("FIN"):
        total = int(msg.split("|")[1])
        break

    seq = int(msg.split("|")[0])
    if start is None:
        start = time.time()

    # simulated loss: pretend this packet never arrived
    if random.random() < args.loss:
        dropped_sim += 1
        continue

    if seq in received:
        duplicates += 1
    else:
        # DETECTION: a jump in sequence numbers means packets are missing
        if seq > highest + 1:
            gap = [s for s in range(highest + 1, seq) if s not in received]
            if gap:
                if not args.quiet:
                    print(f"[receiver] LOSS DETECTED: expected {highest + 1}, got {seq}, missing {gap}")
                missing_ever.update(gap)
        if seq in missing_ever and not args.quiet:
            print(f"[receiver] RECOVERED: packet {seq} arrived after retransmission")
        received.add(seq)
        highest = max(highest, seq)

    # ACK every packet (even duplicates, in case our earlier ACK was lost)
    if random.random() >= args.ack_loss:
        sock.sendto(f"ACK|{seq}".encode(), addr)

if total is None:
    total = highest + 1
# packets missing at the very end (after the last one we saw) also count as gaps
missing_ever.update(s for s in range(total) if s not in received)

# final report
recovered = len(missing_ever & received)
print("\n========== RECEIVER REPORT ==========")
print(f"Packets expected        : {total}")
print(f"Unique packets received : {len(received)}")
print(f"Gaps detected (missing) : {len(missing_ever)}")
print(f"Recovered by retransmit : {recovered}")
print(f"Duplicates received     : {duplicates}")
if args.loss:
    print(f"Simulated drops         : {dropped_sim}")
print(f"Still missing           : {total - len(received)}")
if start:
    print(f"Time taken              : {time.time() - start:.2f} s")

# one machine-readable line for the test scripts
print("RESULT " + json.dumps({"expected": total, "received": len(received), "detected": len(missing_ever),
                              "recovered": recovered, "duplicates": duplicates,
                              "missing": total - len(received)}))
