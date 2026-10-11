// ==UserScript==
// @name         YouTube Profile Card on Hover
// @namespace    https://github.com/tenkeyful
// @homepageURL  https://greasyfork.org/scripts/568098
// @icon         https://raw.githubusercontent.com/tenkeyful/greasyfork/main/YouTubeProfileCardOnHover.png
// @version      1.0.2
// @description  Open YouTube's Profile Card by hovering over profile pictures instead of clicking them.
// @author       <kbd>
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-end
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @noframes
// ==/UserScript==

(function () {
	"use strict";

	let redirectEnabled = GM_getValue("redirectEnabled", true);
	let menuCommandId;

	function updateMenuCommand() {
		if (menuCommandId !== undefined) GM_unregisterMenuCommand(menuCommandId);
		menuCommandId = GM_registerMenuCommand(
			(redirectEnabled ? "Disable" : "Enable") + " Profile Redirect On Click",
			() => {
				redirectEnabled = !redirectEnabled;
				GM_setValue("redirectEnabled", redirectEnabled);
				updateMenuCommand();
			},
		);
	}

	updateMenuCommand();

	const CARD = ".ytProfileCardViewModelHost";

	const SELECTORS = [
		"#author-thumbnail yt-img-shadow img", // avatar
		"ytd-comment-view-model #author-thumbnail", // comment
		"ytd-comment-replies-renderer #author-thumbnail", // reply
	].join(", ");

	let hoverTimer = null;
	let closeTimer = null;
	let lastTarget = null;

	function getCard() {
		return document.querySelector(CARD);
	}
	function isCardOpen() {
		return !!getCard();
	}

	function closeCard(card = getCard()) {
		if (!card) return;
		document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
		document.body.click();
	}

	function scheduleClose() {
		clearTimeout(closeTimer);
		closeTimer = setTimeout(() => {
			const card = getCard();
			if (card?.matches(":hover")) return;
			if (lastTarget?.matches(":hover")) return;
			if (card) closeCard();
			lastTarget = null;
		}, 150);
	}

	function cancelClose() {
		clearTimeout(closeTimer);
	}

	function triggerClick(el) {
		let target = el;
		for (let i = 0; i < 5; i++) {
			if (!target) break;
			if (
				target.tagName === "BUTTON" ||
				target.getAttribute("role") === "button" ||
				target.id === "author-thumbnail"
			) {
				break;
			}
			target = target.parentElement;
		}
		if (target) {
			target.click();
		}
	}

	const channelUrlCache = new WeakMap();

	function getChannelUrl(el) {
		if (channelUrlCache.has(el)) return channelUrlCache.get(el);

		let result = null;
		let container = el;
		for (let i = 0; i < 8; i++) {
			if (!container) break;
			const authorText = container.querySelector("a#author-text");
			if (authorText?.href) {
				result = authorText.href;
				break;
			}
			container = container.parentElement;
		}

		channelUrlCache.set(el, result);
		return result;
	}

	function onAvatarClick(e) {
		if (!e.isTrusted) return;
		if (!redirectEnabled) return;

		const channelUrl = getChannelUrl(e.currentTarget);
		if (channelUrl) {
			e.preventDefault();
			e.stopPropagation();
			window.location.href = channelUrl;
		}
	}

	function onMouseEnter(e) {
		const el = e.currentTarget;
		cancelClose();
		if (el === lastTarget) return;

		clearTimeout(hoverTimer);
		hoverTimer = setTimeout(() => {
			lastTarget = el;
			triggerClick(el);
			attachCardListeners();
		}, 0);
	}

	function onMouseLeave(e) {
		clearTimeout(hoverTimer);
		if (isCardOpen()) {
			scheduleClose();
		}
	}

	let isPolling = false;

	function attachCardListeners() {
		if (isPolling) return;
		isPolling = true;

		let attempts = 0;
		const poll = setInterval(() => {
			const card = getCard();
			attempts++;
			if (card) {
				clearInterval(poll);
				isPolling = false;
				if (card.dataset.hoverCloseBound) return;
				card.dataset.hoverCloseBound = "1";
				card.addEventListener("pointerenter", cancelClose);
				card.addEventListener("pointerleave", scheduleClose);
			} else if (attempts > 20) {
				clearInterval(poll);
				isPolling = false;
			}
		}, 50);
	}

	function onMouseEnterAny(e) {
		if (lastTarget && !lastTarget.contains(e.target)) {
			lastTarget = null;
		}
	}

	function attachListeners(node) {
		if (node.nodeType !== 1) return;

		const avatars = node.matches(SELECTORS)
			? [node]
			: [...node.querySelectorAll(SELECTORS)];

		for (const el of avatars) {
			if (el.dataset.hoverCardBound) continue;
			el.dataset.hoverCardBound = "1";
			el.addEventListener("pointerenter", onMouseEnter);
			el.addEventListener("pointerleave", onMouseLeave);
			el.addEventListener("click", onAvatarClick, true);
		}
	}

	let pendingNodes = [];
	let moTimer = null;

	const observer = new MutationObserver((mutations) => {
		for (const m of mutations) {
			for (const node of m.addedNodes) {
				if (node.nodeType === 1) pendingNodes.push(node);
			}
		}

		clearTimeout(moTimer);
		moTimer = setTimeout(() => {
			const nodes = pendingNodes;
			pendingNodes = [];

			for (const node of nodes) {
				attachListeners(node);
				const card = node.matches(CARD) ? node : node.querySelector(CARD);
				if (card && !card.dataset.hoverCloseBound) {
					card.dataset.hoverCloseBound = "1";
					card.addEventListener("pointerenter", cancelClose);
					card.addEventListener("pointerleave", scheduleClose);
				}
			}
		}, 100);
	});

	observer.observe(document.body, { childList: true, subtree: true });

	window.addEventListener("yt-navigate-finish", () => {
		attachListeners(document.body);
	});

	document.addEventListener("mousemove", onMouseEnterAny, { passive: true });
})();
