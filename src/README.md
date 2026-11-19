# Packet Loss Detection and Recovery

## Files
| File | What it does |
|---|---|
| `udp_sender.py` | Sends numbered UDP packets and resends any packet whose ACK doesn't come back in time. `--no-recovery` turns this off (plain UDP, for comparison). |
| `udp_receiver.py` | Tracks packet numbers, prints `LOSS DETECTED` on a gap, ACKs every packet, prints a report. |
| `tcp_sender.py`, `tcp_receiver.py` | The same transfer over TCP, for Test 4. |
| `mininet_reroute.py` | The Mininet network: main path h1–s1–s2–s4–h2 with loss on s1–s2, backup path s1–s3–s4, path monitor and rerouting. |
| `run_tests.py` | Runs Test 1 and Test 5 on any laptop (loss is simulated). |
| `run_mininet_tests.py` | Runs Tests 1–4 inside Mininet with real loss on the links. |
| `charts.py` | Draws the charts from the CSV files in `results/`. |

## Test cases
| # | Test | Where it runs |
|---|---|---|
| 1 | Different loss amounts: 0, 5, 10, 20% (plain UDP vs our method) | Laptop and Mininet |
| 2 | Broken link: cut s1–s2, measure detection and recovery time | Mininet |
| 3 | Before vs after rerouting: main path vs backup path | Mininet |
| 4 | Our method vs TCP | Mininet |
| 5 | Different timeouts: 0.1, 0.2, 0.5 s | Laptop |

Each test is run 3 times and averaged.

## 1. Live demo (any laptop)
Open two terminals in this folder.

Terminal 1:
```
python3 udp_receiver.py --loss 0.1
```
Terminal 2:
```
python3 udp_sender.py --count 100 --loss 0.1
```

## 2. Laptop tests (Test 1 and Test 5, about 2 minutes)
```
pip3 install matplotlib
python3 run_tests.py
```
Results and charts are saved in `results/`.

## 3. Mininet tests (Tests 1–4, Linux only, about 5 minutes)
Use an Ubuntu VM. On a Mac, use UTM.
```
sudo apt install mininet openvswitch-switch python3-matplotlib
sudo python3 run_mininet_tests.py
```
If a run crashes, clean up with `sudo mn -c` and run it again.

To only show rerouting once (good for a live demo):
```
sudo python3 mininet_reroute.py --loss 10
```
