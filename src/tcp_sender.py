# tcp_sender.py
# Sends the same number of messages as udp_sender.py, but over TCP.
# TCP handles loss by itself, so there is no recovery code here.
#
# Usage: python3 tcp_sender.py --host 10.2.2.20 [--port 6000] [--count 200] [--size 32]

import socket
import argparse
import time

parser = argparse.ArgumentParser()
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=6000)
parser.add_argument("--count", type=int, default=200)
parser.add_argument("--size", type=int, default=32)
args = parser.parse_args()

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)   # send each message straight away
sock.connect((args.host, args.port))
for seq in range(args.count):
    sock.sendall(f"{seq}|hello".ljust(args.size).encode())
    time.sleep(0.002)      # same pacing as plain UDP
sock.shutdown(socket.SHUT_WR)
sock.recv(1)               # wait until the receiver has read everything and closed
sock.close()
print(f"[tcp sender] sent {args.count} messages")
