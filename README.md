# Packet Loss Detection & Recovery

A Computer Networks mini project that implements application-layer packet loss detection and recovery over UDP, combined with link-failure detection and automatic OpenFlow rerouting in Mininet.

> **Core Idea:** Retransmission fixes small random packet losses; SDN rerouting fixes major link failures.

## Overview

Plain UDP provides no delivery guarantees—lost packets are silently dropped. This project adds reliability on top of UDP and pairs it with a fault-tolerant virtual network:

1. **Detection:** Every UDP packet is tagged with a sequence number so the receiver can spot gaps (e.g., receiving `14` then `17` flags `15` and `16` as missing).
2. **Recovery:** The receiver sends an `ACK` for each received packet. If no `ACK` arrives within the timeout window (default `0.2s`), the sender retransmits the missing packet.
3. **Failover Rerouting:** A Mininet topology with Open vSwitch (`s1`–`s4`) routes traffic along a primary path (`s1 → s2 → s4`) with simulated loss (`TCLink`). A Python path monitor probes the primary path with ICMP (`ping`) and updates OpenFlow rules on `s1` and `s4` to shift traffic to the backup path (`s1 → s3 → s4`) if the link breaks or loss exceeds `50%`.

## Network Architecture

```text
                        [ Switch s2 ]  (Main path, 10% simulated loss)
                       /             \
[ Server A (h1) ] --- [ Switch s1 ]   [ Switch s4 ] --- [ Server B (h2) ]
  10.1.1.10/24         \             /                    10.2.2.20/24
                        [ Switch s3 ]  (Backup path)

```

* **Network A (`10.1.1.0/24`):** `h1` (Sender) at `10.1.1.10`
* **Network B (`10.2.2.0/24`):** `h2` (Receiver) at `10.2.2.20`
* **Switches (`s1`–`s4`):** Open vSwitch controlled via OpenFlow rules

## Tech Stack

* **Language:** Python 3
* **Network Emulation:** Mininet, `TCLink`, Open vSwitch (`ovs-ofctl`)
* **Protocols:** UDP (custom sequence numbers & ACKs), OpenFlow, ICMP (`ping`), TCP (baseline comparison)
* **OS:** Ubuntu Linux
* **Presentation:** Interactive HTML/Three.js 3D deck (`presentation/Packet_Loss_Presentation.html`)

## Prerequisites

* Ubuntu Linux (required for Mininet)
* Python 3.8+
* Mininet and Open vSwitch installed:
```bash
sudo apt-get update
sudo apt-get install -y mininet openvswitch-switch
```

## Project Structure

```text
packet-loss-detection-recovery-mininet/
├── README.md
├── .gitignore
├── LICENSE
├── src/                          # Python scripts & Mininet topology/monitor
│   ├── udp_sender.py            # Sender with sequence numbers, ACK handling, retransmission
│   ├── udp_receiver.py          # Receiver with gap detection, ACK generation
│   ├── tcp_sender.py            # TCP sender for baseline comparison
│   ├── tcp_receiver.py          # TCP receiver for baseline comparison
│   ├── mininet_reroute.py       # Mininet topology, OpenFlow rules, path monitor
│   ├── live_demo.py             # Full live demo (600 packets, failure + rerouting)
│   ├── run_tests.py             # Laptop tests (Test 1 & 5) - simulated loss
│   ├── run_mininet_tests.py     # Mininet tests (Tests 1-4) - real loss
│   ├── charts.py                # Generate result charts from CSV
│   └── results/                 # Test logs, CSV outputs, and charts
├── presentation/                # Interactive 3D presentation
│   ├── index.html               # Main presentation (open via HTTP server)
│   ├── deck.css                 # Slide styling
│   ├── netsim.css               # Network simulation styling
│   ├── engine3d.js              # Three.js rendering engine
│   ├── models.js                # 3D models for simulation
│   ├── netsim.js                # Network simulation logic
│   ├── notes.html               # Speaker notes viewer
│   ├── assets/                  # Background images
│   └── vendor/                  # Three.js & OrbitControls
├── docs/                        # Speaker scripts & presentation notes
│   ├── Speaker_Script_Review2.txt
│   └── What_To_Say.txt
└── Packet_Loss_Simulation.html  # Standalone network simulation
```

## Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/packet-loss-detection-recovery-mininet.git
cd packet-loss-detection-recovery-mininet
```

### 2. Live Demo (Any Laptop - Two Terminals)

**Terminal 1 (Receiver):**
```bash
cd src
python3 udp_receiver.py --loss 0.1
```

**Terminal 2 (Sender):**
```bash
cd src
python3 udp_sender.py --count 100 --loss 0.1
```

### 3. Laptop Tests (Test 1 & Test 5 - Simulated Loss)
```bash
cd src
pip3 install matplotlib
python3 run_tests.py
```
Results and charts are saved in `src/results/`.

### 4. Mininet Tests (Tests 1-4 - Real Loss, Linux Only)
```bash
cd src
sudo python3 run_mininet_tests.py
```
If a run crashes, clean up with `sudo mn -c` and run again.

For live demo with rerouting:
```bash
sudo python3 mininet_reroute.py --loss 10
```
Or the full working model:
```bash
sudo python3 live_demo.py
```

### 5. View the Interactive Presentation
```bash
cd presentation
python3 -m http.server 8765
```
Then open `http://localhost:8765` in Chrome.
- Arrow keys: Next/Previous slide
- `F`: Full screen
- `N`: Speaker notes
- `P`: Notes window

## Test Cases

| # | Test | Description | Where it Runs |
|---|------|-------------|---------------|
| 1 | Different loss amounts | 0%, 5%, 10%, 20% loss (plain UDP vs our method) | Laptop & Mininet |
| 2 | Broken link | Cut s1–s2, measure detection & recovery time | Mininet |
| 3 | Before vs after rerouting | Main path vs backup path comparison | Mininet |
| 4 | Our method vs TCP | Same transfer using TCP baseline | Mininet |
| 5 | Different timeouts | 0.1s, 0.2s, 0.5s timeout at 10% loss | Laptop |

Each test runs 3 times and results are averaged.

## Results Summary

In initial 200-packet trials with `10%` induced loss on the `s1–s2` link:

* **Plain UDP:** ~176/200 packets delivered (~24 lost)
* **Our Reliable UDP:** **200/200** packets delivered (`~20` missing packets detected and recovered via retransmission, `0` lost, ~4–5s transfer time)

### Key Findings

| Loss Rate | Plain UDP Delivery | Our Method Delivery | Retransmissions | Time (s) |
|-----------|-------------------|---------------------|-----------------|----------|
| 0%        | 100%              | 100%                | 0               | 0.5      |
| 5%        | 95.8%             | 100%                | ~24             | ~3.0     |
| 10%       | 87.7%             | 100%                | ~48             | ~4.7     |
| 20%       | 76.7%             | 100%                | ~102            | ~8.1     |

**Test 5 - Timeout Tuning (10% loss):**
- 0.1s timeout: ~2.5s transfer, ~48 retransmissions
- 0.2s timeout: ~5.3s transfer, ~50 retransmissions  
- 0.5s timeout: ~12.8s transfer, ~54 retransmissions

Shorter timeouts = faster recovery (as long as timeout > RTT).

## How It Works

### Detection (udp_receiver.py)
- Receiver tracks the highest sequence number seen
- When a packet arrives with a gap (e.g., highest was 1, now got 3), it detects missing packets (2)
- Prints `LOSS DETECTED: expected 2, got 3, missing [2]`

### Recovery (udp_sender.py)
- Sender maintains a sliding window (default 8 packets)
- Each packet sent is timed
- If no ACK received within timeout (default 0.2s), packet is retransmitted
- Selective Repeat: only unacknowledged packets are retransmitted

### Rerouting (mininet_reroute.py)
- PathMonitor thread checks every 0.1s:
  1. Is the s1–s2 interface up?
  2. Do 20 test pings have <50% loss?
- On failure: runs `ovs-ofctl add-flow` to change s1 and s4 from output port 2 → port 3
- Backup path: s1 → s3 → s4 (10ms delay each vs 5ms on main)

## Team

* **Lahaarika Rajuu** - Detection & Recovery Logic
* **Likhit B** - Network Architecture & Rerouting
* **Krithik V** - Testing, Results & Presentation

## License

This project is open-source under the [MIT License](LICENSE).

---

*Built for Computer Networks Mini Project - Review 2 (2026)*