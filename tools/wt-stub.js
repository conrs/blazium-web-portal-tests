// A stand-in for the page script a Betacade play page gives each game: window.wt with the calls
// Blazium's portal glue (misc/dist/html/third_party_services/blazium-betacade.js) makes, plus the
// page's wt:pause / wt:resume window events. It records what the game sends in window.__wt so a test
// can read it, and lets the test drive the replay hooks the game registers.
// ?wt-replay=state opens the page as the smooth replay viewer does: wt.replaying is true.
(function () {
	var q = new URLSearchParams(location.search);
	var rec = (window.__wt = {
		tracks: [],
		scores: [],
		achieves: [],
		snapshot: null,
		replayHooks: null,
		replayHooksAt: null,
		loadedAt: Date.now(),
	});
	window.wt = {
		host: 'betacade',
		replaying: q.get('wt-replay') === 'state',
		track: function (name, fields) {
			rec.tracks.push({ name: name, fields: fields });
		},
		submitScore: function (score) {
			rec.scores.push(score);
			return Promise.resolve(null);
		},
		achieve: function (key) {
			rec.achieves.push(key);
			return Promise.resolve(null);
		},
		onSnapshot: function (fn) {
			rec.snapshot = fn;
		},
		onReplay: function (hooks) {
			rec.replayHooks = hooks;
			rec.replayHooksAt = Date.now();
		},
	};
	window.__pause = function () {
		window.dispatchEvent(new CustomEvent('wt:pause'));
		return 1;
	};
	window.__resume = function () {
		window.dispatchEvent(new CustomEvent('wt:resume'));
		return 1;
	};
})();
