# Packet Loss Detection & Recovery

A Computer Networks mini project built for **Review 2**, implementing application-layer packet loss detection and recovery over UDP in Python, paired with automated OpenFlow failover rerouting in Mininet and an interactive 3D presentation.

---

## Project Overview

Standard User Datagram Protocol (UDP) is fast, but it is unreliable — lost packets are silently dropped without notification. This project implements a reliable UDP transport layer and combines it with software-defined networking (SDN) fault tolerance:

1. **Application-Layer Reliability:** Tags every UDP packet with sequence numbers to detect gaps and trigger selective retransmission via acknowledgments (ACKs).
2. **Automated SDN Failover:** Implements a Mininet topology with primary and backup paths. A background path monitor detects link failure via ICMP probing and dynamically updates OpenFlow rules to reroute traffic.

---

## Core Python Components (src/)

All core execution logic is contained in the `src/` directory:

| Python Script | Purpose & Functionality |
|---------------|--------------------------|
| `udp_sender.py` | Sliding-window sender (--window 8, --timeout 0.2). Assigns sequence numbers, tracks transmission timestamps, handles incoming ACKs, and retransmits unacknowledged packets. Supports --no-recovery for plain UDP comparison. |
| `udp_receiver.py` | Receives numbered datagrams, tracks the highest sequence number seen, detects sequence gaps (LOSS DETECTED), logs recoveries, and sends back ACK|seq datagrams. |
| `mininet_reroute.py` | Builds the 4-switch Mininet topology (s1-s4). Runs a continuous PathMonitor thread checking link operstate and ping loss, executing ovs-ofctl add-flow to reroute traffic instantly. |
| `live_demo.py` | Orchestrates the full live demonstration (600 packets over lossy primary path + simulated cable/switch failure + dynamic rerouting). |
| `run_tests.py` | Executes Test Cases 1 and 5 locally on any laptop with simulated packet loss across 3 trial runs, saving quantitative metrics to src/results/local_results.csv. |
| `run_mininet_tests.py` | Automates Test Cases 1 through 4 inside the Mininet virtual network environment with real link impairment. |
| `charts.py` | Parses CSV result logs using matplotlib to render comparative performance graphs. |

---

## Network Architecture & Topology

```
                          +------------------+
                          |   Network A      |
                          |  10.1.1.0/24     |
                          |  h1: 10.1.1.10   |
                          +--------+---------+
                                   |
                                   | Port 1 (h1-eth0)
                          +--------v---------+
                          |   Switch s1      |
                          |  (Path Decision) |
                          +--------+---------+
                                   |
              +--------------------+--------------------+
              |                                         |
       Port 2 (s1-eth2)                          Port 3 (s1-eth3)
       Main Path (5ms, 10% loss)                   Backup Path (10ms)
              |                                         |
       +------v------+                           +------v------+
       |  Switch s2  |                           |  Switch s3  |
       | (Main Route)|                           |(Backup Route)|
       +------+------+                           +------+------+
              |                                         |
       Port 2 (s2-eth2)                          Port 2 (s3-eth2)
              |                                         |
              +--------------------+--------------------+
                                   |
                          +--------v---------+
                          |   Switch s4      |
                          | (Path Converge)  |
                          +--------+---------+
                                   | Port 1
                          +--------v---------+
                          |   Network B      |
                          |  10.2.2.0/24     |
                          |  h2: 10.2.2.20   |
                          +------------------+
```

**Key Details:**
- **Network A (10.1.1.0/24):** Sender host h1 (10.1.1.10)
- **Network B (10.2.2.0/24):** Receiver host h2 (10.2.2.20)
- **Switches (s1-s4):** Open vSwitch instances managed via OpenFlow rules (failMode=secure)
- **Primary Path:** h1 -> s1 -> s2 -> s4 -> h2 (5ms per link, 10% induced loss on s1-s2)
- **Backup Path:** h1 -> s1 -> s3 -> s4 -> h2 (10ms per link, no induced loss)

---

## Repository Structure

```
packet-loss-detection-recovery-mininet/
├── .gitignore
├── .gitattributes
├── LICENSE
├── README.md
├── src/                          # Core Python scripts & test runner
│   ├── udp_sender.py             # Reliable UDP sender (sliding window)
│   ├── udp_receiver.py           # Reliable UDP receiver & ACK generator
│   ├── tcp_sender.py             # TCP baseline sender
│   ├── tcp_receiver.py           # TCP baseline receiver
│   ├── mininet_reroute.py        # Mininet topology & OpenFlow monitor
│   ├── live_demo.py              # Full end-to-end demonstration script
│   ├── run_tests.py              # Automated laptop test harness (Tests 1 & 5)
│   ├── run_mininet_tests.py      # Mininet test suite (Tests 1 - 4)
│   ├── charts.py                 # Matplotlib chart generator
│   └── results/                  # CSV logs and generated PNG plots
├── presentation/                 # Interactive 3D presentation deck
│   ├── index.html                # Main slide deck (HTML5 / Three.js)
│   ├── Packet_Loss_Presentation.html
│   ├── deck.css / netsim.css     # Styling sheets
│   ├── engine3d.js / models.js   # 3D rendering & network simulation engine
│   ├── netsim.js / notes.html    # Simulation controls & speaker notes view
│   ├── assets/                   # Graphical assets & backgrounds
│   └── vendor/                   # Three.js & OrbitControls libraries
└── docs/                         # Project documentation & speaker notes
    ├── Packet_Loss_Recovery_Presentation.pptx
    ├── Speaker_Script_Review2.txt
    └── What_To_Say.txt
```

---

## Getting Started & Usage

### 1. Clone & Setup
```bash
git clone https://github.com/likithb-dev/packet-loss-detection-recovery-mininet.git
cd packet-loss-detection-recovery-mininet
```

### 2. Run Local Python Simulation (Any Laptop)
Open two separate terminal windows inside the `src/` directory:

**Terminal 1 (Start Receiver):**
```bash
cd src
python3 udp_receiver.py --loss 0.1
```

**Terminal 2 (Start Sender):**
```bash
cd src
python3 udp_sender.py --count 100 --loss 0.1
```

### 3. Run Automated Laptop Test Suite
```bash
cd src
pip3 install matplotlib
python3 run_tests.py
```
*(Generates performance metrics and saves CSV logs/charts to src/results/)*

### 4. Run Mininet Network Tests (Ubuntu / Linux VM)
```bash
cd src
sudo apt-get update && sudo apt-get install -y mininet openvswitch-switch python3-matplotlib
sudo python3 run_mininet_tests.py
```
*(To run the live interactive rerouting demo):*
```bash
sudo python3 mininet_reroute.py --loss 10
```

### 5. View the Interactive Presentation
To launch the 3D presentation deck with embedded speaker notes:
```bash
cd presentation
python3 -m http.server 8765
```
Open your browser at **http://localhost:8765**.  
**Shortcuts:** Arrow keys (Navigate slides), F (Fullscreen), N (Speaker notes overlay), P (Separate notes window).

---

## Test Cases & Results Summary

| Test # | Evaluation Objective | Parameters | Environment |
|--------|----------------------|------------|-------------|
| 1      | Packet Loss vs. Delivery | 0%, 5%, 10%, 20% loss rate | Laptop & Mininet |
| 2      | Link Failure Detection & Recovery | Primary link down (s1-s2) | Mininet |
| 3      | Rerouting Impact Analysis | Before vs. After backup path activation | Mininet |
| 4      | Custom Reliable UDP vs. TCP | Baseline comparison | Mininet |
| 5      | Retransmission Timeout Tuning | 0.1s, 0.2s, 0.5s timeout windows | Laptop |

### Performance Metrics (Average of 3 Trials at 10% Loss)
- **Plain UDP:** ~87.7% delivery rate (12.3% unrecoverable data loss).
- **Our Reliable UDP:** **100% delivery rate** (0% loss, ~48 retransmissions, ~4.7s transfer duration).

---

## Team Members

- **Likhit B.** — Network Architecture, OpenFlow Rerouting & Mininet Emulation
- **Lahaarika Rajuu** — Application-Layer Sequence Detection & Recovery Logic
- **Krithik V.** — Experimental Test Harness, Data Visualization & Presentation Deck

---

## License

This project is open-source under the terms of the [MIT License](LICENSE).
