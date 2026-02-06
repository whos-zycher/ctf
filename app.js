const SB_URL = "https://ogkycbscvwktffjbbsyu.supabase.co";
const SB_KEY = "sb_publishable_x--NEx-Fkpuj5LWF0HTvtw_UbHcS2ef";
const TECH_DOMAIN = "ctf.local";

const sb = supabase.createClient(SB_URL, SB_KEY);

let currentUser = null;
let authMode = "login";

function showToast(msg, type = "info") {
	const box = document.createElement("div");
	box.className = `toast ${type}`;
	box.textContent = msg;

	const container = document.getElementById("toast-container");
	if (container) container.appendChild(box);

	requestAnimationFrame(() => box.classList.add("visible"));
	setTimeout(() => {
		box.classList.remove("visible");
		setTimeout(() => box.remove(), 300);
	}, 4000);
}

function escapeHTML(str) {
	if (!str) return "";
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function setAuthMode(mode) {
	authMode = mode;

	document.getElementById("tab-login").className =
		mode === "login" ? "tab-btn active" : "tab-btn";
	document.getElementById("tab-register").className =
		mode === "register" ? "tab-btn active" : "tab-btn";

	const dnGroup = document.getElementById("display-name-group");
	if (mode === "register") dnGroup.classList.remove("hidden");
	else dnGroup.classList.add("hidden");

	document.getElementById("action-btn").textContent =
		mode === "login" ? "[AUTHENTICATE]" : "[REGISTER]";
}

async function executeAuth() {
	const loginName = document.getElementById("login-name").value.trim();
	const pass = document.getElementById("pass").value;
	const btn = document.getElementById("action-btn");

	if (!loginName || !pass) return showToast("Credentials missing.", "error");
	if (!/^[a-zA-Z0-9_]+$/.test(loginName))
		return showToast("Username: Alphanumeric only.", "error");

	const email = `${loginName}@${TECH_DOMAIN}`;

	btn.disabled = true;
	btn.textContent = "HANDSHAKING...";

	try {
		if (authMode === "register") {
			const displayName = document
				.getElementById("display-name")
				.value.trim();
			if (!displayName) throw new Error("Display Name required.");

			const { error } = await sb.auth.signUp({
				email: email,
				password: pass,
				options: {
					data: {
						login_name: loginName,
						display_name: displayName,
					},
				},
			});

			if (error) throw error;
			showToast("Identity created. Proceed to Login.", "success");
			setAuthMode("login");
		} else {
			const { error } = await sb.auth.signInWithPassword({
				email,
				password: pass,
			});
			if (error) throw error;
			window.location.reload();
		}
	} catch (err) {
		console.error("Auth Error:", err);
		let msg = "Authentication failed.";
		if (err.message && err.message.includes("Invalid login"))
			msg = "Invalid credentials.";
		if (err.message && err.message.includes("already registered"))
			msg = "Username taken.";
		showToast(msg, "error");
	} finally {
		btn.disabled = false;
		btn.textContent =
			authMode === "login" ? "[AUTHENTICATE]" : "[REGISTER]";
	}
}

async function logout() {
	await sb.auth.signOut();
	window.location.reload();
}

function router(pageId) {
	if (window.location.hash !== `#${pageId}`) {
		history.pushState(null, "", `#${pageId}`);
	}

	document
		.querySelectorAll(".view-section")
		.forEach((el) => el.classList.add("hidden"));

	const target = document.getElementById(`page-${pageId}`);
	if (target) target.classList.remove("hidden");

	document.querySelectorAll(".nav-link").forEach((link) => {
		link.classList.remove("active");
		if (link.dataset.page === pageId) {
			link.classList.add("active");
		}
	});

	if (pageId === "challenges") loadChallenges();
	if (pageId === "scoreboard") loadLeaderboard();
	if (pageId === "users") loadUsers();
	if (pageId === "profile") loadProfileStats();
	if (pageId === "settings") loadProfileStats();
}

window.addEventListener("hashchange", () => {
	const hash = window.location.hash.slice(1) || "challenges";
	router(hash);
});

async function init() {
	const { data } = await sb.auth.getSession();
	currentUser = data.session?.user;

	if (currentUser) {
		document.getElementById("page-auth").classList.add("hidden");
		document.getElementById("main-layout").classList.remove("hidden");

		loadNavbarInfo();

		const hash = window.location.hash.slice(1) || "challenges";
		router(hash);
	}
}

async function loadNavbarInfo() {
	const { data } = await sb
		.from("profiles")
		.select("display_name")
		.eq("id", currentUser.id)
		.single();
	const name =
		data?.display_name ||
		currentUser.user_metadata?.display_name ||
		"UNKNOWN";
	document.getElementById("nav-user").textContent = `[ ${name} ]`;
}

let currentChallengeId = null;
let challengesCache = [];
let displayMode = "normal";

function setDisplayMode(mode) {
	displayMode = mode;
	document
		.getElementById("mode-normal")
		.classList.toggle("active", mode === "normal");
	document
		.getElementById("mode-storyline")
		.classList.toggle("active", mode === "storyline");
	loadChallenges();
}

async function loadChallenges() {
	const container = document.getElementById("challenges-list");
	container.innerHTML =
		'<div class="loader">Scanning active modules...</div>';

	const { data: challs, error } = await sb
		.from("challenges_view")
		.select("*")
		.order("points");

	if (error) {
		console.error("Load Challenges Error:", error);
		return showToast("Unable to load content.", "error");
	}

	challengesCache = challs || [];

	const { data: solves } = await sb
		.from("solves")
		.select("challenge_id, solved_at")
		.eq("user_id", currentUser.id);
	const solvedSet = new Set(solves?.map((s) => s.challenge_id));

	const filteredChalls = challengesCache.filter((c) => {
		if (displayMode === "normal") {
			return (
				c.is_storyline === false ||
				c.is_storyline === null ||
				c.is_storyline === undefined
			);
		} else {
			return c.is_storyline === true;
		}
	});

	let storylineUnlockMap = {};
	if (displayMode === "storyline") {
		const storylineChalls = filteredChalls.filter(
			(c) => c.order_index != null,
		);
		const sortedByOrder = storylineChalls.sort(
			(a, b) => a.order_index - b.order_index,
		);
		sortedByOrder.forEach((c) => {
			if (c.order_index === 1) {
				storylineUnlockMap[c.id] = true;
			} else {
				const prevChall = sortedByOrder.find(
					(p) => p.order_index === c.order_index - 1,
				);
				if (prevChall && solvedSet.has(prevChall.id)) {
					storylineUnlockMap[c.id] = true;
				} else {
					storylineUnlockMap[c.id] = false;
				}
			}
		});
	}

	const categories = {};
	filteredChalls.forEach((c) => {
		let cat = c.category || "Uncategorized";
		cat = cat.charAt(0).toUpperCase() + cat.slice(1);

		if (!categories[cat]) {
			categories[cat] = [];
		}
		categories[cat].push(c);
	});

	container.innerHTML = "";

	if (Object.keys(categories).length === 0) {
		container.innerHTML =
			'<div class="loader">No challenges available in this mode.</div>';
		return;
	}

	Object.keys(categories)
		.sort()
		.forEach((categoryName) => {
			const categoryChalls = categories[categoryName];

			if (displayMode === "storyline") {
				categoryChalls.sort(
					(a, b) => (a.order_index || 0) - (b.order_index || 0),
				);
			}

			const solvedCount = categoryChalls.filter((c) =>
				solvedSet.has(c.id),
			).length;
			const totalCount = categoryChalls.length;

			const section = document.createElement("div");
			section.className = "category-section";

			const header = document.createElement("div");
			header.className = "category-header";
			header.innerHTML = `
			<span class="category-name">${escapeHTML(categoryName)}</span>
			<span class="category-progress">${solvedCount} / ${totalCount}</span>
		`;
			section.appendChild(header);

			const grid = document.createElement("div");
			grid.className = "challenges-grid";

			categoryChalls.forEach((c) => {
				const isDone = solvedSet.has(c.id);
				let isLocked = false;

				if (displayMode === "storyline") {
					isLocked = !storylineUnlockMap[c.id] && !isDone;
				}

				const card = document.createElement("div");
				let cardClasses = "challenge-card-clickable";
				if (isDone) cardClasses += " solved";
				if (isLocked) cardClasses += " storyline-locked";
				card.className = cardClasses;

				if (!isLocked) {
					card.onclick = () => openChallengeModal(c.id);
				}

				const cardHeader = document.createElement("div");
				cardHeader.className = "card-header";

				const titleSpan = document.createElement("span");
				titleSpan.className = "card-title";
				titleSpan.textContent = c.title;

				const pointsSpan = document.createElement("span");
				pointsSpan.className = "card-points";
				pointsSpan.textContent = `${c.points} PTS`;

				cardHeader.appendChild(titleSpan);
				cardHeader.appendChild(pointsSpan);

				const statusSpan = document.createElement("span");
				statusSpan.className = "card-status";
				if (isDone) {
					statusSpan.textContent = "// SOLVED";
				} else if (isLocked) {
					statusSpan.textContent = "// LOCKED";
				} else {
					statusSpan.textContent = "Click to solve";
				}

				card.appendChild(cardHeader);
				card.appendChild(statusSpan);

				grid.appendChild(card);
			});

			section.appendChild(grid);
			container.appendChild(section);
		});
}

async function updateAttemptsDisplay(challengeId) {
	const challenge = challengesCache.find((c) => c.id === challengeId);
	if (!challenge) return;

	const badge = document.getElementById("modal-badge");

	if (!challenge.max_attempts) {
		badge.classList.add("hidden");
		return;
	}

	const { data: count, error } = await sb.rpc("get_my_attempts", {
		p_challenge_id: challengeId,
	});

	if (error) {
		console.error("Error fetching attempts:", error);
		return;
	}

	const attemptsCount = count || 0;

	badge.textContent = `MAX ${challenge.max_attempts} ATTEMPTS`;

	const counterSpan = document.createElement("span");
	counterSpan.style.display = "block";
	counterSpan.style.fontSize = "0.8em";
	counterSpan.style.marginTop = "0.25rem";
	counterSpan.style.opacity = "0.8";
	counterSpan.textContent = `Used: ${attemptsCount} / ${challenge.max_attempts}`;
	badge.appendChild(counterSpan);

	badge.classList.remove("hidden");
}
async function openChallengeModal(challengeId) {
	currentChallengeId = challengeId;
	const challenge = challengesCache.find((c) => c.id === challengeId);
	if (!challenge) return;

	const { data: userSolve } = await sb
		.from("solves")
		.select("solved_at")
		.eq("user_id", currentUser.id)
		.eq("challenge_id", challengeId)
		.single();

	const isSolved = !!userSolve;

	if (displayMode === "storyline" && challenge.is_storyline && !isSolved) {
		const storylineChalls = challengesCache
			.filter((c) => c.is_storyline && c.order_index != null)
			.sort((a, b) => a.order_index - b.order_index);

		const { data: solves } = await sb
			.from("solves")
			.select("challenge_id")
			.eq("user_id", currentUser.id);
		const solvedSet = new Set(solves?.map((s) => s.challenge_id));

		let isUnlocked = false;
		if (challenge.order_index === 1) {
			isUnlocked = true;
		} else {
			const prevChall = storylineChalls.find(
				(c) => c.order_index === challenge.order_index - 1,
			);
			if (prevChall && solvedSet.has(prevChall.id)) {
				isUnlocked = true;
			}
		}

		if (!isUnlocked) {
			showToast("Complete the previous challenge first.", "error");
			return;
		}
	}

	document.getElementById("modal-title").textContent = challenge.title;
	document.getElementById("modal-points").textContent =
		`${challenge.points} PTS`;
	document.getElementById("modal-desc").textContent = challenge.description;

	await updateAttemptsDisplay(challengeId);

	const downloadLink = document.getElementById("modal-download");
	if (challenge.file_url) {
		downloadLink.href = challenge.file_url;
		downloadLink.classList.remove("hidden");
	} else {
		downloadLink.classList.add("hidden");
	}

	const inputSection = document.getElementById("modal-input-section");
	const solvedSection = document.getElementById("modal-solved-section");
	if (isSolved) {
		inputSection.classList.add("hidden");
		solvedSection.classList.remove("hidden");
	} else {
		inputSection.classList.remove("hidden");
		solvedSection.classList.add("hidden");
		document.getElementById("modal-flag-input").value = "";
	}

	switchModalTab("challenge");

	await loadSolvers(challengeId);

	document.getElementById("challenge-modal").classList.remove("hidden");

	if (!isSolved) {
		setTimeout(
			() => document.getElementById("modal-flag-input").focus(),
			100,
		);
	}

	document.getElementById("modal-flag-input").onkeydown = (e) => {
		if (e.key === "Enter") submitModalFlag();
	};
}

function switchModalTab(tabName) {
	document
		.getElementById("modal-tab-challenge")
		.classList.toggle("active", tabName === "challenge");
	document
		.getElementById("modal-tab-solvers")
		.classList.toggle("active", tabName === "solvers");

	document
		.getElementById("modal-content-challenge")
		.classList.toggle("hidden", tabName !== "challenge");
	document
		.getElementById("modal-content-solvers")
		.classList.toggle("hidden", tabName !== "solvers");
}

async function loadSolvers(challengeId) {
	const solversList = document.getElementById("modal-solvers-list");
	solversList.innerHTML = '<span class="no-solvers">Loading...</span>';

	const { data: solves } = await sb
		.from("solves")
		.select("user_id, solved_at")
		.eq("challenge_id", challengeId)
		.order("solved_at", { ascending: true });

	const solveCount = solves?.length || 0;
	document.getElementById("modal-solvers-count").textContent = solveCount;
	document.getElementById("modal-solvers-total").textContent =
		`${solveCount} solver${solveCount !== 1 ? "s" : ""}`;

	if (!solves || solves.length === 0) {
		solversList.innerHTML =
			'<span class="no-solvers">No one has solved this yet. Be the first!</span>';
		return;
	}

	const userIds = solves.map((s) => s.user_id);
	const { data: profiles } = await sb
		.from("profiles")
		.select("id, display_name")
		.in("id", userIds);

	const profileMap = {};
	profiles?.forEach((p) => (profileMap[p.id] = p.display_name));

	solversList.innerHTML = "";
	solves.forEach((solve, index) => {
		const item = document.createElement("div");
		item.className = "solver-item";

		const nameSpan = document.createElement("span");
		nameSpan.className = "solver-name";
		if (index === 0) {
			nameSpan.textContent = `🥇 ${profileMap[solve.user_id] || "Unknown"}`;
		} else {
			nameSpan.textContent = profileMap[solve.user_id] || "Unknown";
		}

		const timeSpan = document.createElement("span");
		timeSpan.className = "solver-time";
		timeSpan.textContent = new Date(solve.solved_at).toLocaleString();

		item.appendChild(nameSpan);
		item.appendChild(timeSpan);
		solversList.appendChild(item);
	});
}

function closeModal() {
	document.getElementById("challenge-modal").classList.add("hidden");
	currentChallengeId = null;
}

async function submitModalFlag() {
	if (!currentChallengeId) return;

	const input = document.getElementById("modal-flag-input");
	const guess = input.value.trim();

	if (!guess) return showToast("Input empty.", "info");
	if (guess.length > 256) return showToast("Payload too large.", "error");

	const btn = document.getElementById("modal-submit-btn");
	btn.disabled = true;
	btn.textContent = "...";

	const { data: success, error } = await sb.rpc("submit_flag", {
		p_challenge_id: currentChallengeId,
		p_guess: guess,
	});

	btn.disabled = false;
	btn.textContent = "[SUBMIT]";

	await updateAttemptsDisplay(currentChallengeId);

	if (error) {
		console.error("Submit Flag Error:", error);
		const safeErrors = [
			"GAME OVER",
			"BANNED",
			"COOLDOWN",
			"ALREADY SOLVED",
		];
		const isSafe = safeErrors.some((msg) => error.message.includes(msg));
		showToast(isSafe ? error.message : "Submission failed.", "error");

		input.value = "";
	} else if (success) {
		showToast("FLAG ACCEPTED. Points awarded.", "success");

		document.getElementById("modal-input-section").classList.add("hidden");
		document
			.getElementById("modal-solved-section")
			.classList.remove("hidden");

		await loadSolvers(currentChallengeId);

		loadChallenges();
	} else {
		showToast("INCORRECT.", "error");
		input.style.border = "1px solid red";
		setTimeout(() => (input.style.border = ""), 500);
	}
}

async function submitFlag(id) {
	const input = document.getElementById(`flag-${id}`);
	const guess = input.value.trim();

	if (!guess) return showToast("Input empty.", "info");
	if (guess.length > 256) return showToast("Payload too large.", "error");

	const { data: success, error } = await sb.rpc("submit_flag", {
		p_challenge_id: id,
		p_guess: guess,
	});

	if (error) {
		showToast(error.message, "error");
		input.value = "";
	} else if (success) {
		showToast("FLAG ACCEPTED. Points awarded.", "success");
		loadChallenges();
	} else {
		showToast("INCORRECT.", "error");
		input.style.border = "1px solid red";
		setTimeout(() => (input.style.border = ""), 500);
	}
}

let scoreChart = null;

const chartColors = [
	"#4a9eff",
	"#22c55e",
	"#f59e0b",
	"#ef4444",
	"#8b5cf6",
	"#ec4899",
	"#06b6d4",
	"#84cc16",
	"#f97316",
	"#6366f1",
];

async function loadLeaderboard() {
	const tbody = document.querySelector("#ranking-table tbody");
	const chartCanvas = document.getElementById("score-chart");
	const legendContainer = document.getElementById("chart-legend");

	tbody.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";

	const { data: leaderboard } = await sb
		.from("leaderboard")
		.select("*")
		.limit(50);

	const { data: solveHistory } = await sb
		.from("solves")
		.select("user_id, challenge_id, solved_at")
		.order("solved_at", { ascending: true });

	const { data: challenges } = await sb
		.from("challenges_view")
		.select("id, points");

	const { data: profiles } = await sb
		.from("profiles")
		.select("id, display_name");

	tbody.innerHTML = "";

	if (!leaderboard || leaderboard.length === 0) {
		tbody.innerHTML = "<tr><td colspan='4'>No data yet</td></tr>";
		return;
	}

	const pointsMap = {};
	challenges?.forEach((c) => (pointsMap[c.id] = c.points || 0));

	const profileMap = {};
	profiles?.forEach((p) => (profileMap[p.id] = p.display_name));

	const top10 = leaderboard.slice(0, 10);
	const top10Ids = new Set(
		top10
			.map((u) => {
				const entry = profiles?.find(
					(p) => p.display_name === u.display_name,
				);
				return entry?.id;
			})
			.filter(Boolean),
	);

	const userScoreTimelines = {};

	let earliestTime = null;
	solveHistory?.forEach((solve) => {
		const time = new Date(solve.solved_at);
		if (!earliestTime || time < earliestTime) {
			earliestTime = time;
		}
	});

	solveHistory?.forEach((solve) => {
		if (!top10Ids.has(solve.user_id)) return;

		const userName = profileMap[solve.user_id] || "Unknown";
		const points = pointsMap[solve.challenge_id] || 0;
		const timestamp = new Date(solve.solved_at);

		if (!userScoreTimelines[userName]) {
			userScoreTimelines[userName] = [
				{
					x: earliestTime || new Date(),
					y: 0,
				},
			];
		}

		const prevScore =
			userScoreTimelines[userName].length > 0
				? userScoreTimelines[userName][
						userScoreTimelines[userName].length - 1
					].y
				: 0;

		userScoreTimelines[userName].push({
			x: timestamp,
			y: prevScore + points,
		});
	});

	const datasets = [];
	let colorIndex = 0;

	top10.forEach((user) => {
		const timeline = userScoreTimelines[user.display_name];
		if (timeline && timeline.length > 0) {
			const pointRadii = timeline.map((point, index) =>
				index === 0 ? 0 : 3,
			);

			datasets.push({
				label: user.display_name,
				data: timeline,
				borderColor: chartColors[colorIndex % chartColors.length],
				backgroundColor: chartColors[colorIndex % chartColors.length],
				borderWidth: 2,
				pointRadius: pointRadii,
				pointHoverRadius: 5,
				tension: 0.1,
				fill: false,
			});
			colorIndex++;
		}
	});

	if (scoreChart) {
		scoreChart.destroy();
	}

	const ctx = chartCanvas.getContext("2d");
	scoreChart = new Chart(ctx, {
		type: "line",
		data: { datasets },
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: {
				mode: "nearest",
				axis: "xy",
				intersect: false,
			},
			plugins: {
				legend: {
					display: false,
				},
				tooltip: {
					backgroundColor: "#141414",
					borderColor: "#2a2a2a",
					borderWidth: 1,
					titleColor: "#ffffff",
					bodyColor: "#666666",
					padding: 12,
					displayColors: true,
					callbacks: {
						title: function (context) {
							const date = new Date(context[0].parsed.x);
							return (
								date.toLocaleDateString() +
								" " +
								date.toLocaleTimeString()
							);
						},
						label: function (context) {
							return `${context.dataset.label}: ${context.parsed.y} pts`;
						},
					},
				},
			},
			scales: {
				x: {
					type: "time",
					time: {
						unit: "day",
						displayFormats: {
							day: "MMM d",
						},
					},
					grid: {
						color: "#2a2a2a",
					},
					ticks: {
						color: "#666666",
					},
				},
				y: {
					beginAtZero: true,
					suggestedMax: 10,
					grid: {
						color: "#2a2a2a",
					},
					ticks: {
						color: "#666666",
						stepSize: 1,
						callback: function (value) {
							if (Number.isInteger(value)) {
								return value;
							}
							return null;
						},
					},
				},
			},
		},
	});

	legendContainer.innerHTML = "";
	datasets.forEach((ds, i) => {
		const item = document.createElement("div");
		item.className = "legend-item";

		const colorBox = document.createElement("span");
		colorBox.className = "legend-color";
		colorBox.style.background = ds.borderColor;

		const labelSpan = document.createElement("span");
		labelSpan.className = "legend-label";
		labelSpan.textContent = ds.label;

		item.appendChild(colorBox);
		item.appendChild(labelSpan);

		item.onclick = () => {
			const meta = scoreChart.getDatasetMeta(i);
			meta.hidden = !meta.hidden;
			item.style.opacity = meta.hidden ? "0.4" : "1";
			scoreChart.update();
		};
		legendContainer.appendChild(item);
	});

	leaderboard.forEach((row, index) => {
		const tr = document.createElement("tr");

		const currentNavUser = document
			.getElementById("nav-user")
			.textContent.replace(/[\[\]]/g, "")
			.trim();
		const isCurrentUser = row.display_name === currentNavUser;

		const rankTd = document.createElement("td");
		rankTd.textContent = `#${index + 1}`;
		if (index < 3) rankTd.style.color = "var(--primary)";

		const userTd = document.createElement("td");
		userTd.textContent = row.display_name;
		if (isCurrentUser) userTd.style.color = "var(--primary)";
		else userTd.style.color = "var(--text-main)";

		const solvedTd = document.createElement("td");
		solvedTd.textContent = row.solved;

		const scoreTd = document.createElement("td");
		scoreTd.textContent = row.score;
		scoreTd.style.color = "var(--primary)";

		tr.appendChild(rankTd);
		tr.appendChild(userTd);
		tr.appendChild(solvedTd);
		tr.appendChild(scoreTd);

		tbody.appendChild(tr);
	});
}

async function loadUsers() {
	const container = document.getElementById("users-list");
	container.innerHTML = '<div class="loader">Fetching users...</div>';

	const { data } = await sb
		.from("profiles")
		.select("display_name, created_at")
		.order("created_at", { ascending: false })
		.limit(20);

	container.innerHTML = "";
	if (data) {
		data.forEach((u) => {
			const card = document.createElement("div");
			card.className = "user-card";

			const initial = u.display_name
				? u.display_name.charAt(0).toUpperCase()
				: "?";

			const avatar = document.createElement("div");
			avatar.className = "user-avatar";
			avatar.textContent = initial;

			const info = document.createElement("div");
			info.className = "user-info";

			const nameDiv = document.createElement("div");
			nameDiv.className = "user-name";
			nameDiv.textContent = u.display_name;

			const dateDiv = document.createElement("div");
			dateDiv.className = "user-date";
			dateDiv.textContent = `Joined ${new Date(u.created_at).toLocaleDateString()}`;

			info.appendChild(nameDiv);
			info.appendChild(dateDiv);

			card.appendChild(avatar);
			card.appendChild(info);

			container.appendChild(card);
		});
	}
}

async function loadProfileStats() {
	const loginName = currentUser.email.split("@")[0];

	const { data: profile } = await sb
		.from("profiles")
		.select("display_name, created_at")
		.eq("id", currentUser.id)
		.single();

	const displayName =
		profile?.display_name ||
		currentUser.user_metadata?.display_name ||
		"Unknown";

	document.getElementById("profile-name").textContent = displayName;
	document.getElementById("profile-email").textContent = `@${loginName}`;
	document.getElementById("profile-avatar").textContent = displayName
		.charAt(0)
		.toUpperCase();

	const { count: solveCount } = await sb
		.from("solves")
		.select("*", { count: "exact", head: true })
		.eq("user_id", currentUser.id);
	document.getElementById("profile-solves-count").textContent =
		solveCount || 0;

	const { data: solves } = await sb
		.from("solves")
		.select("challenge_id")
		.eq("user_id", currentUser.id);

	let totalScore = 0;
	if (solves && solves.length > 0) {
		const challengeIds = solves.map((s) => s.challenge_id);
		const { data: challenges } = await sb
			.from("challenges_view")
			.select("id, points")
			.in("id", challengeIds);

		if (challenges) {
			totalScore = challenges.reduce(
				(sum, c) => sum + (c.points || 0),
				0,
			);
		}
	}
	document.getElementById("profile-score").textContent = totalScore;

	const { data: leaderboard } = await sb
		.from("leaderboard")
		.select("display_name");
	let rank = "-";
	if (leaderboard) {
		const idx = leaderboard.findIndex(
			(r) => r.display_name === displayName,
		);
		if (idx !== -1) rank = `#${idx + 1}`;
	}
	document.getElementById("profile-rank").textContent = rank;

	const settingsUsername = document.getElementById("settings-username");
	const settingsJoined = document.getElementById("settings-joined");
	if (settingsUsername) settingsUsername.textContent = loginName;
	if (settingsJoined && profile?.created_at) {
		settingsJoined.textContent = new Date(
			profile.created_at,
		).toLocaleDateString();
	}
}

async function updatePassword() {
	const pass = document.getElementById("new-pass").value;
	if (!pass) return showToast("Password empty", "error");

	const { error } = await sb.auth.updateUser({ password: pass });
	if (error) showToast(error.message, "error");
	else {
		showToast("Password updated successfully.", "success");
		document.getElementById("new-pass").value = "";
	}
}

document.addEventListener("DOMContentLoaded", init);

window.setAuthMode = setAuthMode;
window.executeAuth = executeAuth;
window.router = router;
window.loadChallenges = loadChallenges;
window.logout = logout;
window.updatePassword = updatePassword;
window.switchModalTab = switchModalTab;
window.setDisplayMode = setDisplayMode;
