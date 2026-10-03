import sys
import json
import sqlite3

db_path = sys.argv[1] if len(sys.argv) > 1 else ':memory:'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

# Read lines of JSON: {"id": 1, "sql": "...", "params": [...]}
for line in sys.stdin:
    if not line.strip():
        continue
    try:
        req = json.loads(line)
        sql = req.get("sql", "")
        params = req.get("params", [])
        cursor = conn.cursor()
        cursor.execute(sql, params)
        conn.commit()
        rows = [dict(r) for r in cursor.fetchall()]
        resp = {"id": req.get("id"), "success": True, "results": rows, "changes": cursor.rowcount}
    except Exception as e:
        resp = {"id": req.get("id"), "success": False, "error": str(e)}
    sys.stdout.write(json.dumps(resp) + "\n")
    sys.stdout.flush()
