# udp_sender.py
# Sends numbered UDP packets and recovers lost ones using
# ACKs + timeout-based retransmission (Selective Repeat style sliding window).
#
# Usage: python3 udp_sender.py --host 10.2.2.20 [--count 200] [--window 8]
#                              [--timeout 0.2] [--loss 0.1] [--no-recovery] [--quiet]
#   --loss         simulate loss at the sender (drop before sending), for laptop testing.
#   --no-recovery  plain UDP: send every packet once, never retransmit (used for comparison).
#   --quiet        don't print a line for every retransmission (used by the test scripts).

import socket
import argparse
import random
import time
import json

parser = argparse.ArgumentParser()
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=5000)
parser.add_argument("--count", type=int, default=200)
parser.add_argument("--window", type=int, default=8)
parser.add_argument("--timeout", type=float, default=0.2)
parser.add_argument("--loss", type=float, default=0.0)
parser.add_argument("--no-recovery", action="store_true")
parser.add_argument("--quiet", action="store_true")
parser.add_argument("--max-time", type=float, default=60)
args = parser.parse_args()

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.settimeout(0.02)
dest = (args.host, args.port)

N = args.count
base = 0                # oldest packet not yet ACKed
next_seq = 0            # next new packet to send
acked = set()
sent_time = {}
transmissions = 0
retransmissions = 0


def send(seq):
    global transmissions
    transmissions += 1
    sent_time[seq] = time.time()
    if random.random() < args.loss:
        return  # simulated loss: packet "lost" on the way
    sock.sendto(f"{seq}|{time.time():.6f}|hello".encode(), dest)


mode = "plain UDP (no recovery)" if args.no_recovery else f"window={args.window}, timeout={args.timeout}s"
print(f"[sender] sending {N} packets to {dest}, {mode}")
start = time.time()

if args.no_recovery:
    # plain UDP: fire and forget, nobody checks if packets arrived
    for seq in range(N):
        send(seq)
        time.sleep(0.002)
else:
    while base < N and time.time() - start < args.max_time:
        # 1. fill the window with new packets
        while next_seq < base + args.window and next_seq < N:
            send(next_seq)
            next_seq += 1

        # 2. read ACKs
        try:
            data, _ = sock.recvfrom(1024)
            seq = int(data.decode().split("|")[1])
            acked.add(seq)
            while base in acked:
                base += 1
        except socket.timeout:
            pass

        # 3. RECOVERY: retransmit any packet whose ACK did not come back in time
        now = time.time()
        for seq in range(base, next_seq):
            if seq not in acked and now - sent_time[seq] > args.timeout:
                if not args.quiet:
                    print(f"[sender] timeout for packet {seq}, retransmitting")
                retransmissions += 1
                send(seq)

elapsed = time.time() - start
time.sleep(0.2)
for _ in range(5):
    sock.sendto(f"FIN|{N}".encode(), dest)
    time.sleep(0.02)

print("\n=========== SENDER REPORT ===========")
print(f"Packets sent (unique)   : {N}")
print(f"Total transmissions     : {transmissions}")
print(f"Retransmissions         : {retransmissions}")
print(f"Retransmission rate     : {100 * retransmissions / N:.1f} %")
print(f"Time taken              : {elapsed:.2f} s")
print(f"Throughput              : {N / elapsed:.1f} packets/s")

# one machine-readable line for the test scripts
print("RESULT " + json.dumps({"transmissions": transmissions, "retransmissions": retransmissions,
                              "time": round(elapsed, 3)}))
