extends Node2D
# Betacade SDK Test. Tap the orb; 5 hits clear a level and the orb shrinks. Every call and signal of
# Blazium's built-in Betacade singleton (blazium-engine/blazium#855) is used, and the panel on the
# right logs each call and each signal with the arguments it got. Each log line is also printed as
# "[SDK] ..." and pushed to window.__sdk, so a headless test can read it.
#
# URL switches:
#   ?lazy=1        no Betacade call at boot but load/is_available/is_replaying (gap 3)
#   ?state=always  call set_state in a replay too (the workaround for gap 4)

const HITS_PER_LEVEL := 5
const SAVE_KEY := "sdk_test_save"
const TMP_KEY := "sdk_test_tmp"
const PANEL_W := 380.0

var level := 1
var hits := 0
var misses := 0
var score := 0
var best := 0
var runs := 0
var target := Vector2.ZERO
var radius := 50.0
var level_started_ms := 0
var target_shown_ms := 0
var paused := false
var replaying := false
var lazy := false
var state_always := false
var started := false
var last_save_ms := -100000
var lines: PackedStringArray = []
var _font: Font


func _ready() -> void:
	_font = ThemeDB.fallback_font
	randomize()
	var q := _query()
	lazy = q.contains("lazy=1")
	state_always = q.contains("state=always")
	# Every signal, connected first: before any save, event or set_state (gap 3).
	Betacade.paused.connect(_on_paused)
	Betacade.resumed.connect(_on_resumed)
	Betacade.replay_entered.connect(_on_replay_entered)
	Betacade.replay_state.connect(_on_replay_state)
	Betacade.replay_exited.connect(_on_replay_exited)
	Betacade.result.connect(func(json): _log("signal result(%s)" % _show(json)))
	Betacade.unavailable.connect(func(msg): _log("signal unavailable(%s)" % _show(msg)))

	_log("boot: web=%s betacade_feature=%s query=%s" % [OS.has_feature("web"), OS.has_feature("betacade"), q])
	_log("is_available() -> %s" % Betacade.is_available())
	replaying = Betacade.is_replaying()
	_log("is_replaying() -> %s" % replaying)
	_log("is_on_host() -> %s  get_last_error() -> %s" % [Betacade.is_on_host(), _show(Betacade.get_last_error())])

	var raw = Betacade.load(SAVE_KEY, {})
	_log("load(%s, {}) -> %s" % [SAVE_KEY, _show(raw)])
	var saved: Dictionary = raw if raw is Dictionary else {}
	level = int(saved.get("level", 1))
	best = int(saved.get("best", 0))
	runs = int(saved.get("runs", 0)) + 1
	_log("load(missing_key, 42) -> %s" % _show(Betacade.load("sdk_test_missing", 42)))
	_start_level()
	if not lazy and not replaying:
		_begin()


# The first calls that reach the page through web_call (save, remove, event, set_state).
func _begin() -> void:
	if started:
		return
	started = true
	_save(true)
	_log("save(%s, 7) -> %s" % [TMP_KEY, Betacade.save(TMP_KEY, 7)])
	_log("load(%s) -> %s" % [TMP_KEY, _show(Betacade.load(TMP_KEY))])
	Betacade.remove(TMP_KEY)
	_log("remove(%s); load -> %s" % [TMP_KEY, _show(Betacade.load(TMP_KEY, "gone"))])
	_event("run.start", {"level": level, "run": runs, "on_betacade": Betacade.is_available(), "build": "sdk-test"})


func _query() -> String:
	if not OS.has_feature("web"):
		return ""
	var s = JavaScriptBridge.eval("location.search", true)
	return s if s is String else ""


func _show(v) -> String:
	var s := "%s:%s" % [type_string(typeof(v)), JSON.stringify(v) if typeof(v) != TYPE_STRING else "\"" + v + "\""]
	return s.substr(0, 160)


func _log(line: String) -> void:
	var stamp := "%7.2f " % (Time.get_ticks_msec() / 1000.0)
	lines.append(stamp + line)
	if lines.size() > 26:
		lines = lines.slice(lines.size() - 26)
	print("[SDK] " + line)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("(window.__sdk = window.__sdk || []).push(%s)" % JSON.stringify(line), true)
	queue_redraw()


func _event(name: String, fields: Dictionary) -> void:
	Betacade.event(name, fields)
	_log("event(%s, %s)" % [name, JSON.stringify(fields)])


func _save(force := false) -> void:
	var now := Time.get_ticks_msec()
	if not force and now - last_save_ms < 1000:
		return
	last_save_ms = now
	var ok := Betacade.save(SAVE_KEY, {"level": level, "score": score, "best": best, "runs": runs})
	_log("save(%s, level %d score %d best %d) -> %s" % [SAVE_KEY, level, score, best, ok])


func _on_paused(a = null) -> void:
	paused = true
	_log("signal paused(%s)" % ("" if a == null else _show(a)))


func _on_resumed(a = null) -> void:
	paused = false
	_log("signal resumed(%s)" % ("" if a == null else _show(a)))


func _on_replay_entered(a = null) -> void:
	_log("signal replay_entered(%s)" % ("" if a == null else _show(a)))


func _on_replay_exited(a = null) -> void:
	_log("signal replay_exited(%s)" % ("" if a == null else _show(a)))


func _on_replay_state(s) -> void:
	_log("signal replay_state(%s)" % _show(s))
	if typeof(s) != TYPE_DICTIONARY:
		return
	level = int(s.get("level", level))
	hits = int(s.get("hits", hits))
	score = int(s.get("score", score))
	var t: Dictionary = s.get("target", {})
	target = Vector2(t.get("x", target.x), t.get("y", target.y))
	radius = t.get("r", radius)
	queue_redraw()


func _start_level() -> void:
	hits = 0
	misses = 0
	radius = max(14.0, 50.0 - (level - 1) * 5.0)
	level_started_ms = Time.get_ticks_msec()
	_move_target()


func _move_target() -> void:
	var size := get_viewport_rect().size
	var w: float = max(size.x - PANEL_W, radius * 2.0 + 1.0)
	target = Vector2(randf_range(radius, w - radius), randf_range(radius + 50.0, size.y - radius))
	target_shown_ms = Time.get_ticks_msec()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.__orb = %s" % JSON.stringify({"x": target.x, "y": target.y, "r": radius}), true)
	queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	if replaying or paused:
		return
	var pos := Vector2.INF
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		pos = event.position
	elif event is InputEventScreenTouch and event.pressed:
		pos = event.position
	if pos == Vector2.INF or pos.x > get_viewport_rect().size.x - PANEL_W:
		return
	_begin()
	if pos.distance_to(target) <= radius:
		_hit()
	else:
		misses += 1
		_event("orb.miss", {"level": level, "distance": snappedf(pos.distance_to(target) - radius, 0.1)})
	queue_redraw()


func _hit() -> void:
	var ms := Time.get_ticks_msec() - target_shown_ms
	hits += 1
	score += max(1, 100 - ms / 20) * level
	best = max(best, score)
	_event("orb.hit", {"level": level, "reaction_ms": ms})
	if hits >= HITS_PER_LEVEL:
		var seconds := (Time.get_ticks_msec() - level_started_ms) / 1000.0
		_event("level.complete", {"level": level, "seconds": snappedf(seconds, 0.01), "misses": misses})
		Betacade.submit_score(score)
		_log("submit_score(%d)" % score)
		level += 1
		_start_level()
		_save(true)
		# After the save: achieve() syncs the saves now, and Betacade judges its rules on them.
		if level == 3:
			Betacade.achieve("cleared_level_2")
			_log("achieve(cleared_level_2)")
	else:
		_move_target()
		_save()


func _process(_delta: float) -> void:
	if not started and not (replaying and state_always):
		return
	if state_always or not replaying:
		Betacade.set_state(_state())


func _state() -> Dictionary:
	return {"level": level, "hits": hits, "score": score, "target": {"x": target.x, "y": target.y, "r": radius}}


func _draw() -> void:
	var size := get_viewport_rect().size
	var px := size.x - PANEL_W
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.07, 0.08, 0.11))
	draw_circle(target, radius, Color(0.3, 0.75, 0.95))
	draw_circle(target, radius * 0.5, Color(0.95, 0.97, 1.0))
	var hud := "Level %d  Hits %d/%d  Score %d  Best %d" % [level, hits, HITS_PER_LEVEL, score, best]
	draw_string(_font, Vector2(14, 30), hud, HORIZONTAL_ALIGNMENT_LEFT, px - 20, 20, Color.WHITE)
	draw_rect(Rect2(px, 0, PANEL_W, size.y), Color(0.02, 0.02, 0.03))
	draw_string(_font, Vector2(px + 10, 20), "Betacade SDK log", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color(0.6, 0.9, 1.0))
	var y := 40.0
	for l in lines:
		draw_string(_font, Vector2(px + 8, y), l, HORIZONTAL_ALIGNMENT_LEFT, PANEL_W - 14, 11, Color(0.85, 0.88, 0.9))
		y += 21.0
	if paused:
		draw_rect(Rect2(0, 0, px, size.y), Color(0, 0, 0, 0.5))
		draw_string(_font, Vector2(0, size.y / 2), "Paused", HORIZONTAL_ALIGNMENT_CENTER, px, 36, Color.WHITE)
