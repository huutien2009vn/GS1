"""What the device keeps between runs: settings, the GeneSense account and the measurement history (JSON files),
plus a CSV log on the microSD card (or next to the program when there is no card)."""
import json
import os
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
CONFIG_FILE = os.path.join(DATA_DIR, "config.json")
HISTORY_FILE = os.path.join(DATA_DIR, "history.json")
HISTORY_MAX = 300

_lock = threading.RLock()                    # the screen and the sending thread both touch these


def _load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def _save(path, value):
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False)
    os.replace(tmp, path)                    # never leaves a half-written file


class Config:
    """Account token and name, Gemini key, reminder times."""

    def __init__(self):
        with _lock:
            self.data = _load(CONFIG_FILE, {})

    def get(self, key, default=None):
        with _lock:
            return self.data.get(key, default)

    def set(self, **values):
        with _lock:
            self.data.update(values)
            _save(CONFIG_FILE, self.data)


class History:
    """Finished measurements, oldest first: {t, hr, spo2, mock, sent, local}.
    `sent` = saved in the GeneSense profile; `local` = never to be sent (taken before signing in, or without a clock)."""

    def __init__(self):
        with _lock:
            self.items = _load(HISTORY_FILE, [])

    def add(self, hr, spo2, mock, clock_ok):
        with _lock:
            item = {"t": int(time.time()) if clock_ok else 0, "hr": hr, "spo2": spo2, "mock": bool(mock),
                    "sent": False, "local": False, "added": time.time()}
            self.items.append(item)
            del self.items[:-HISTORY_MAX]
            _save(HISTORY_FILE, self.items)
            return item

    def next_unsent(self):
        with _lock:
            for item in self.items:
                if not (item["mock"] or item["sent"] or item["local"]):
                    return dict(item)
        return None

    def mark(self, item, **flags):
        with _lock:
            for it in self.items:
                if it.get("added") == item.get("added") and it["hr"] == item["hr"] and it["spo2"] == item["spo2"]:
                    it.update(flags)
            _save(HISTORY_FILE, self.items)

    def keep_all_local(self):                # on signing in: older readings stay on the device
        with _lock:
            for it in self.items:
                it["local"] = True
            _save(HISTORY_FILE, self.items)

    def unsent_count(self):
        with _lock:
            return sum(1 for it in self.items if not (it["mock"] or it["sent"] or it["local"]))

    def recent(self, n):
        with _lock:
            return [dict(it) for it in self.items[-n:]]

    def clear(self):
        with _lock:
            self.items = []
            _save(HISTORY_FILE, self.items)


def sd_folder():
    """The microSD card's folder (the M10 mounts cards and USB sticks under /media), or None."""
    try:
        with open("/proc/mounts") as f:
            for line in f:
                parts = line.split()
                if len(parts) > 1 and parts[1].startswith("/media/") and "mmcblk" in parts[0]:
                    return parts[1]
    except OSError:
        pass
    return None


def log_csv(item):
    folder = sd_folder()
    path = os.path.join(folder, "GeneSense") if folder else DATA_DIR
    try:
        os.makedirs(path, exist_ok=True)
        path = os.path.join(path, "measurements.csv")
        new = not os.path.exists(path)
        with open(path, "a", encoding="utf-8") as f:
            if new:
                f.write("time,unix_time,heart_rate,spo2,mock\n")
            when = time.strftime("%Y-%m-%d %H:%M", time.localtime(item["t"])) if item["t"] else ""
            f.write("%s,%s,%d,%d,%d\n" % (when, item["t"] or "", item["hr"], item["spo2"], 1 if item["mock"] else 0))
    except OSError as e:
        print("CSV log: %s" % e)
