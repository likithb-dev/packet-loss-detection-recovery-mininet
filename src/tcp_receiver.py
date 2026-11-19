# tcp_receiver.py
# Receives a stream of fixed-size messages over TCP and counts them.
# Used only to compare our UDP method with TCP (Test 4).
#
# Usage: python3 tcp_receiver.py [--port 6000] [--size 32]

import socket
import argparse
import time
import json

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=6000)
parser.add_argument("--size", type=int, default=32)
args = parser.parse_args()

srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("0.0.0.0", args.port))
srv.listen(1)
print(f"[tcp receiver] listening on TCP port {args.port}")

conn, addr = srv.accept()
start = time.time()
total = 0
while True:
    chunk = conn.recv(65536)
    if not chunk:          # sender closed the connection: all data is in
        break
    total += len(chunk)
elapsed = time.time() - start
conn.close()

messages = total // args.size
print(f"[tcp receiver] got {messages} messages in {elapsed:.2f} s")
print("RESULT " + json.dumps({"received": messages, "time": round(elapsed, 3)}))
