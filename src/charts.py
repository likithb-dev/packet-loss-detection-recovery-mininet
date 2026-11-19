# charts.py
# Draws the result charts from the CSV files in the results/ folder.
# Usage: python3 charts.py      (needs: pip3 install matplotlib)

import csv
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
GREY, BLUE, RED = "#9AA5B1", "#1E6FD9", "#D64545"
plt.rcParams.update({"font.size": 11, "axes.spines.top": False, "axes.spines.right": False})


def load(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return list(csv.DictReader(f))


def avg(rows, key):
    return sum(float(r[key]) for r in rows) / len(rows) if rows else 0


def pick(rows, test, setting=None, mode=None):
    return [r for r in rows if r["test"] == test and (setting is None or r["setting"] == str(setting))
            and (mode is None or r["mode"] == mode)]


def save(fig, folder, name):
    fig.tight_layout()
    path = os.path.join(folder, name)
    fig.savefig(path, dpi=160)
    plt.close(fig)
    print("  saved", path)


def loss_charts(rows, folder, prefix, where):
    levels = sorted({int(r["setting"]) for r in pick(rows, "1_loss")})
    if not levels:
        return
    x = range(len(levels))
    plain = [100 * avg(pick(rows, "1_loss", l, "plain UDP"), "received") / avg(pick(rows, "1_loss", l, "plain UDP"), "expected")
             for l in levels]
    ours = [100 * avg(pick(rows, "1_loss", l, "our method"), "received") / avg(pick(rows, "1_loss", l, "our method"), "expected")
            for l in levels]
    fig, ax = plt.subplots(figsize=(7, 4.2))
    b1 = ax.bar([i - 0.2 for i in x], plain, 0.4, color=GREY, label="Plain UDP")
    b2 = ax.bar([i + 0.2 for i in x], ours, 0.4, color=BLUE, label="Our method")
    ax.bar_label(b1, fmt="%.0f%%", fontsize=9)
    ax.bar_label(b2, fmt="%.0f%%", fontsize=9)
    ax.set_xticks(list(x), [f"{l}%" for l in levels])
    ax.set_xlabel("Packet loss on the link")
    ax.set_ylabel("Packets delivered (%)")
    ax.set_ylim(0, 125)
    ax.set_title(f"Test 1: Packets delivered vs packet loss ({where})")
    ax.legend(loc="upper center", ncol=2, frameon=False)
    save(fig, folder, f"{prefix}test1_delivery.png")

    resends = [avg(pick(rows, "1_loss", l, "our method"), "retransmissions") for l in levels]
    times = [avg(pick(rows, "1_loss", l, "our method"), "time") for l in levels]
    fig, ax = plt.subplots(figsize=(7, 4.2))
    bars = ax.bar(list(x), resends, 0.5, color=BLUE)
    ax.bar_label(bars, fmt="%.0f", fontsize=9)
    ax.set_xticks(list(x), [f"{l}%\n({t:.1f} s)" for l, t in zip(levels, times)])
    ax.set_xlabel("Packet loss on the link (average transfer time)")
    ax.set_ylabel("Retransmissions per 200 packets")
    ax.set_title(f"Test 1: Cost of recovery ({where})")
    save(fig, folder, f"{prefix}test1_resends.png")


def timeout_chart(rows, folder):
    sets = sorted({float(r["setting"]) for r in pick(rows, "5_timeout")})
    if not sets:
        return
    labels = [f"{s:g} s" for s in sets]
    resends = [avg(pick(rows, "5_timeout", f"{s:g}"), "retransmissions") for s in sets]
    times = [avg(pick(rows, "5_timeout", f"{s:g}"), "time") for s in sets]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9, 4))
    b = a1.bar(labels, resends, 0.5, color=BLUE); a1.bar_label(b, fmt="%.0f", fontsize=9)
    a1.set_title("Retransmissions"); a1.set_xlabel("Timeout (wait before resending)")
    b = a2.bar(labels, times, 0.5, color=GREY); a2.bar_label(b, fmt="%.2f s", fontsize=9)
    a2.set_title("Total transfer time"); a2.set_xlabel("Timeout (wait before resending)")
    fig.suptitle("Test 5: Effect of the timeout value (10% loss)")
    save(fig, folder, "test5_timeout.png")


def failure_chart(rows, folder):
    if not rows:
        return
    trials = [f"Trial {r['trial']}" for r in rows]
    det = [float(r["detection_ms"]) for r in rows]
    rec = [float(r["recovery_ms"]) for r in rows]
    fig, ax = plt.subplots(figsize=(7, 4.2))
    x = range(len(rows))
    b1 = ax.bar([i - 0.2 for i in x], det, 0.4, color=GREY, label="Detection time")
    b2 = ax.bar([i + 0.2 for i in x], rec, 0.4, color=BLUE, label="Recovery time (traffic stopped)")
    ax.bar_label(b1, fmt="%.0f", fontsize=9); ax.bar_label(b2, fmt="%.0f", fontsize=9)
    ax.set_xticks(list(x), trials)
    ax.set_ylabel("Milliseconds")
    ax.set_title("Test 2: Link failure - detection and recovery time")
    ax.legend(frameon=False)
    save(fig, folder, "mininet_test2_link_failure.png")


def before_after_chart(rows, folder):
    groups = [("Main path\n(10% loss)", "main"), ("Backup path\n(after reroute)", "backup")]
    data = pick(rows, "3_before_after")
    if not data:
        return
    plain = [100 * avg(pick(rows, "3_before_after", g, "plain UDP"), "missing") / 200 for _, g in groups]
    resend = [avg(pick(rows, "3_before_after", g, "our method"), "retransmissions") for _, g in groups]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9, 4))
    b = a1.bar([l for l, _ in groups], plain, 0.5, color=[RED, BLUE]); a1.bar_label(b, fmt="%.1f%%", fontsize=9)
    a1.set_title("Packets lost (plain UDP)")
    b = a2.bar([l for l, _ in groups], resend, 0.5, color=[RED, BLUE]); a2.bar_label(b, fmt="%.0f", fontsize=9)
    a2.set_title("Resends needed (our method)")
    fig.suptitle("Test 3: Packet loss before vs after rerouting")
    save(fig, folder, "mininet_test3_before_after.png")


def tcp_chart(rows, folder):
    data = pick(rows, "4_tcp_vs_udp")
    if not data:
        return
    modes = ["plain UDP", "our method", "TCP"]
    deliv = [100 * avg(pick(rows, "4_tcp_vs_udp", None, m), "received") / 200 for m in modes]
    times = [avg(pick(rows, "4_tcp_vs_udp", None, m), "time") for m in modes]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(9, 4))
    b = a1.bar(modes, deliv, 0.5, color=[GREY, BLUE, RED]); a1.bar_label(b, fmt="%.0f%%", fontsize=9)
    a1.set_ylim(0, 112); a1.set_title("Packets delivered")
    b = a2.bar(modes, times, 0.5, color=[GREY, BLUE, RED]); a2.bar_label(b, fmt="%.2f s", fontsize=9)
    a2.set_title("Transfer time")
    fig.suptitle("Test 4: Our method vs TCP (10% loss on main path)")
    save(fig, folder, "mininet_test4_tcp_vs_udp.png")


def make_all(folder=os.path.join(HERE, "results")):
    print("\nDrawing charts...")
    local = load(os.path.join(folder, "local_results.csv"))
    loss_charts(local, folder, "", "laptop, simulated loss")
    timeout_chart(local, folder)
    mn = load(os.path.join(folder, "mininet_results.csv"))
    loss_charts(mn, folder, "mininet_", "Mininet")
    before_after_chart(mn, folder)
    tcp_chart(mn, folder)
    failure_chart(load(os.path.join(folder, "mininet_link_failure.csv")), folder)


if __name__ == "__main__":
    make_all()
