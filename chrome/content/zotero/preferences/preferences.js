/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2006–2013 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

"use strict";

var Zotero_Preferences = {
	panes: new Map(),
	
	_firstPaneLoadDeferred: Zotero.Promise.defer(),
	
	_observerSymbols: new Map(),

	init: function () {
		this.navigation = document.getElementById('prefs-navigation');
		this.content = document.getElementById('prefs-content');
		this.helpContainer = document.getElementById('prefs-help-container');

		this.navigation.addEventListener('select', () => this._onNavigationSelect());
		document.getElementById('prefs-search').addEventListener('command',
			event => this._search(event.target.value));
		
		document.getElementById('prefs-subpane-back-button').addEventListener('command', () => {
			let parent = this.panes.get(this.navigation.value).parent;
			if (parent) {
				this.navigation.value = parent;
			}
		});

		document.getElementById('prefs-search').focus();
		
		Zotero.PreferencePanes.builtInPanes.forEach(pane => this._addPane(pane));
		if (Zotero.PreferencePanes.pluginPanes.length) {
			this.navigation.append(document.createElement('hr'));
			Zotero.PreferencePanes.pluginPanes
				.sort((a, b) => Zotero.localeCompare(a.rawLabel, b.rawLabel))
				.forEach(pane => this._addPane(pane));
		}

		if (window.arguments) {
			var io = window.arguments[0];
			io = io.wrappedJSObject || io;

			if (io.pane) {
				let tabID = io.tab;
				let tabIndex = io.tabIndex;
				var pane = this.panes.get(io.pane);
				this.navigation.value = io.pane;
				// Select tab within pane by tab id
				if (tabID !== undefined) {
					let tab = document.getElementById(tabID);
					if (tab) {
						tab.control.selectedItem = tab;
					}
				}
				// Select tab within pane by index
				else if (tabIndex !== undefined) {
					let tabBox = pane.container.querySelector('tabbox');
					if (tabBox) {
						tabBox.selectedIndex = tabIndex;
					}
				}
			}
		}
		else if (document.location.hash == "#cite") {
			this.navigation.value = 'zotero-prefpane-cite';
		}

		if (!this.navigation.value) {
			this.navigation.value = Zotero.Prefs.get('lastSelectedPrefPane');
			// If no last selected pane or ID is invalid, select General
			if (!this.navigation.value) {
				this.navigation.value = 'zotero-prefpane-general';
			}
		}
	},
	
	onUnload: function () {
		for (let symbol of this._observerSymbols.values()) {
			Zotero.Prefs.unregisterObserver(symbol);
		}
		this._observerSymbols.clear();
	},
	
	waitForFirstPaneLoad: async function () {
		await this._firstPaneLoadDeferred.promise;
	},

	/**
	 * Select a pane in the navigation sidebar, displaying its content.
	 * Clears the current search and hides all other panes' content.
	 *
	 * @param {String} id
	 */
	navigateToPane(id) {
		this.navigation.value = id;
	},

	openHelpLink: function () {
		let helpURL = this.panes.get(this.navigation.value)?.helpURL;
		if (helpURL) {
			Zotero.launchURL(helpURL);
		}
	},

	_onNavigationSelect() {
		for (let child of this.content.children) {
			if (child !== this.helpContainer) {
				child.setAttribute('hidden', true);
			}
		}
		let paneID = this.navigation.value;
		if (paneID) {
			this.content.scrollTop = 0;
			document.getElementById('prefs-search').value = '';
			this._search('');
			this._loadAndDisplayPane(paneID);
		}
		Zotero.Prefs.set('lastSelectedPrefPane', paneID);
	},

	/**
	 * Add a pane to the left navigation sidebar. The pane source (`src`) is
	 * loaded as a fragment, not a full document.
	 *
	 * @param {Object} options
	 * @param {String} options.id Must be unique
	 * @param {String} [options.pluginID] ID of the plugin that registered the pane
	 * @param {String} [options.parent] ID of parent pane (if provided, pane is hidden from the sidebar)
	 * @param {String} [options.label] A DTD/.properties key (optional for panes with parents)
	 * @param {String} [options.rawLabel] A raw string to use as the label if options.label is not provided
	 * @param {String} [options.image] URI of an icon (displayed in the navigation sidebar)
	 * @param {String} options.src URI of an XHTML fragment
	 * @param {String[]} [options.scripts] Array of URIs of scripts to load along with the pane
	 * @param {String[]} [options.stylesheets] Array of URIs of CSS stylesheets to load along with the pane
	 * @param {Boolean} [options.defaultXUL] If true, parse the markup at `src` as XUL instead of XHTML:
	 * 		whitespace-only text nodes are ignored, XUL is the default namespace, and HTML tags are
	 * 		namespaced under `html:`. Default behavior is the opposite: whitespace nodes are preserved,
	 * 		HTML is the default namespace, and XUL tags are under `xul:`.
	 * @param {String} [options.helpURL] If provided, a help button will be displayed under the pane
	 * 		and the provided URL will open when it is clicked
	 */
	_addPane(options) {
		let { id, parent, label, rawLabel, image } = options;

		let listItem = document.createXULElement('richlistitem');
		listItem.value = id;

		if (image) {
			let imageElem = document.createXULElement('image');
			imageElem.src = image;
			listItem.append(imageElem);
		}

		// We still add a hidden richlistitem even if this is a subpane,
		// so we can invisibly select it and prevent richlistbox from selecting
		// its first visible child on focus (which would hide the visible subpane)
		if (parent) {
			listItem.hidden = true;
		}
		else {
			let labelElem = document.createXULElement('label');
			if (rawLabel) {
				labelElem.value = rawLabel;
			}
			else if (Zotero.Intl.strings.hasOwnProperty(label)) {
				labelElem.value = Zotero.Intl.strings[label];
			}
			else {
				labelElem.value = Zotero.getString(label);
			}
			listItem.append(labelElem);
		}

		this.navigation.append(listItem);

		let container = document.createElement('div');
		container.hidden = true;
		this.helpContainer.before(container);

		this.panes.set(id, {
			...options,
			imported: false,
			container,
		});
	},

	/**
	 * Display a pane's content, alongside any other panes already showing.
	 * If the pane is not yet loaded, it will be loaded first.
	 *
	 * @param {String} id
	 */
	_loadAndDisplayPane(id) {
		let pane = this.panes.get(id);
		if (!pane.imported) {
			if (pane.scripts) {
				for (let script of pane.scripts) {
					Services.scriptloader.loadSubScript(script, window);
				}
			}
			if (pane.stylesheets) {
				for (let stylesheet of pane.stylesheets) {
					document.insertBefore(
						document.createProcessingInstruction('xml-stylesheet', `href="${stylesheet}"`),
						document.firstChild
					);
				}
			}
			let markup = Zotero.File.getContentsFromURL(pane.src);
			let dtdFiles = [
				'chrome://zotero/locale/zotero.dtd',
				'chrome://zotero/locale/preferences.dtd',
			];
			let contentFragment = pane.defaultXUL
				? MozXULElement.parseXULToFragment(markup, dtdFiles)
				: this._parseXHTMLToFragment(markup, dtdFiles);
			contentFragment = document.importNode(contentFragment, true);
			this._initImportedNodesPreInsert(contentFragment);
			pane.container.append(contentFragment);
			pane.imported = true;
			this._initImportedNodesPostInsert(pane.container);
		}

		pane.container.hidden = false;

		let backButton = document.getElementById('prefs-subpane-back-button');
		backButton.hidden = !pane.parent;
	},
	
	_parseXHTMLToFragment(str, entities = []) {
		// Adapted from MozXULElement.parseXULToFragment

		/* eslint-disable indent */
		let parser = new DOMParser();
		parser.forceEnableXULXBL();
		let doc = parser.parseFromSafeString(
			`
${entities.length
		? `<!DOCTYPE bindings [ ${entities.reduce((preamble, url, index) => {
				return preamble + `<!ENTITY % _dtd-${index} SYSTEM "${url}"> %_dtd-${index}; `;
			}, '')}]>`
		: ""}
<div xmlns="http://www.w3.org/1999/xhtml"
		xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul">
${str}
</div>`, "application/xml");
		/* eslint-enable indent */

		if (doc.documentElement.localName === 'parsererror') {
			throw new Error('not well-formed XHTML');
		}

		// We use a range here so that we don't access the inner DOM elements from
		// JavaScript before they are imported and inserted into a document.
		let range = doc.createRange();
		range.selectNodeContents(doc.querySelector('div'));
		return range.extractContents();
	},

	/**
	 * To be called before insertion into the document tree:
	 * Move all processing instructions (XML <?...?>) found in the imported fragment into the document root
	 * so that they actually have an effect. This essentially "activates" <?xml-stylesheet?> nodes.
	 *
	 * @param {DocumentFragment} fragment
	 * @private
	 */
	_initImportedNodesPreInsert(fragment) {
		let processingInstrWalker = document.createTreeWalker(fragment, NodeFilter.SHOW_PROCESSING_INSTRUCTION);
		let processingInstr = processingInstrWalker.currentNode;
		while (processingInstr) {
			document.insertBefore(
				document.createProcessingInstruction(processingInstr.target, processingInstr.data),
				document.firstChild
			);
			if (processingInstr.parentNode) {
				processingInstr.parentNode.removeChild(processingInstr);
			}
			processingInstr = processingInstrWalker.nextNode();
		}
	},

	_useChecked(elem) {
		return (elem instanceof HTMLInputElement && elem.type == 'checkbox')
			|| elem.tagName == 'checkbox';
	},

	_syncFromPref(elem, preference) {
		let value = Zotero.Prefs.get(preference, true);
		if (this._useChecked(elem)) {
			elem.checked = value;
		}
		else {
			elem.value = value;
		}
		elem.dispatchEvent(new Event('syncfrompreference'));
	},

	_syncToPrefOnModify(event) {
		if (event.currentTarget.getAttribute('preference')) {
			let value = this._useChecked(event.currentTarget) ? event.currentTarget.checked : event.currentTarget.value;
			Zotero.Prefs.set(event.currentTarget.getAttribute('preference'), value, true);
			event.currentTarget.dispatchEvent(new Event('synctopreference'));
		}
	},

	/**
	 * To be called after insertion into the document tree:
	 * Activates `preference` attributes and inline oncommand handlers and dispatches a load event at the end.
	 *
	 * @param {Element} container
	 * @private
	 */
	_initImportedNodesPostInsert(container) {
		let attachToPreference = (elem) => {
			if (this._observerSymbols.has(elem)) {
				return;
			}
			
			let preference = elem.getAttribute('preference');
			try {
				if (container.querySelector('preferences > preference#' + preference)) {
					Zotero.warn('<preference> is deprecated -- `preference` attribute values '
						+ 'should be full preference keys, not <preference> IDs');
					preference = container.querySelector('preferences > preference#' + preference)
						.getAttribute('name');
					elem.setAttribute('preference', preference);
				}
				else if (!preference.includes('.')) {
					Zotero.warn('`preference` attribute value `' + preference + '` looks like a <preference> ID, '
						+ 'although no element with that ID exists. Its value should be a preference key.');
				}
			}
			catch (e) {
				// Ignore
			}

			Zotero.debug(`Attaching <${elem.tagName}> element to ${preference}`);
			let symbol = Zotero.Prefs.registerObserver(
				preference,
				() => this._syncFromPref(elem, preference),
				true
			);
			this._observerSymbols.set(elem, symbol);
			
			if (elem.tagName === 'menulist') {
				// Set up an observer to resync if this menulist has items added/removed later
				// (If we set elem.value before the corresponding item is added, the label won't be updated when it
				//  does get added, unless we do this)
				new MutationObserver(() => this._syncFromPref(elem, preference))
					.observe(elem, {
						childList: true,
						subtree: true
					});
			}

			elem.addEventListener('command', this._syncToPrefOnModify.bind(this));
			elem.addEventListener('input', this._syncToPrefOnModify.bind(this));
			elem.addEventListener('change', this._syncToPrefOnModify.bind(this));

			// Set timeout before populating the value so the pane can add listeners first
			setTimeout(() => {
				this._syncFromPref(elem, elem.getAttribute('preference'));
			});
		};
		
		let detachFromPreference = (elem) => {
			if (this._observerSymbols.has(elem)) {
				Zotero.debug(`Detaching <${elem.tagName}> element from preference`);
				Zotero.Prefs.unregisterObserver(this._observerSymbols.get(elem));
				this._observerSymbols.delete(elem);
			}
		};

		// Activate `preference` attributes
		for (let elem of container.querySelectorAll('[preference]')) {
			attachToPreference(elem);
		}
		
		new MutationObserver((mutations) => {
			for (let mutation of mutations) {
				if (mutation.type == 'attributes') {
					let target = mutation.target;
					detachFromPreference(target);
					if (target.hasAttribute('preference')) {
						attachToPreference(target);
					}
				}
				else if (mutation.type == 'childList') {
					for (let node of mutation.removedNodes) {
						detachFromPreference(node);
						if (node.nodeType == Node.ELEMENT_NODE) {
							for (let subElem of node.querySelectorAll('[preference]')) {
								detachFromPreference(subElem);
							}
						}
					}
					for (let node of mutation.addedNodes) {
						if (node.nodeType == Node.ELEMENT_NODE) {
							if (node.hasAttribute('preference')) {
								attachToPreference(node);
							}
							for (let subElem of node.querySelectorAll('[preference]')) {
								attachToPreference(subElem);
							}
						}
					}
				}
			}
		}).observe(container, {
			childList: true,
			subtree: true,
			attributeFilter: ['preference']
		});

		// parseXULToFragment() doesn't convert oncommand attributes into actual
		// listeners, so we'll do it here
		for (let elem of container.querySelectorAll('[oncommand]')) {
			elem.oncommand = elem.getAttribute('oncommand');
		}

		for (let child of container.children) {
			child.dispatchEvent(new Event('load'));
		}

		// If this is the first pane to be loaded, notify anyone waiting
		// (for tests)
		this._firstPaneLoadDeferred.resolve();
	},

	/**
	 * If term is falsy, clear the current search and show the first pane.
	 * If term is truthy, execute a search:
	 *   - Deselect the selected section
	 *   - Show all preferences from all sections
	 *   - Hide those not matching the search term (by full text and data-search-strings[-raw])
	 *   - Highlight full-text matches and show tooltips by search string matches
	 *
	 * @param {String} [term]
	 */
	_search(term) {
		// Initial housekeeping:

		// Clear existing highlights
		this._getSearchSelection().removeAllRanges();

		// Remove existing tooltips
		// Need to convert to array before iterating so elements being removed from the
		// live collection doesn't mess with the iteration
		for (let oldTooltipParent of [...this.content.getElementsByClassName('search-tooltip-parent')]) {
			oldTooltipParent.replaceWith(oldTooltipParent.firstElementChild);
		}

		// Show hidden sections
		for (let hidden of [...this.content.getElementsByClassName('hidden-by-search')]) {
			hidden.classList.remove('hidden-by-search');
			hidden.ariaHidden = false;
		}

		if (!term) {
			if (this.navigation.selectedIndex == -1) {
				this.navigation.selectedIndex = 0;
			}
			this.helpContainer.hidden = !this.panes.get(this.navigation.value)?.helpURL;
			return;
		}

		// Clear pane selection
		this.navigation.clearSelection();
		
		// Don't show help button when searching
		this.helpContainer.hidden = true;

		// Make sure all panes are loaded into the DOM and show top-level ones
		for (let [id, pane] of this.panes) {
			if (pane.parent) {
				pane.container.hidden = true;
			}
			else {
				this._loadAndDisplayPane(id);
			}
		}

		// Replace <label value="abc"/> with <label>abc</label>
		// This renders exactly the same and enables highlighting using ranges
		for (let label of document.getElementsByTagNameNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'label')) {
			if (label.getAttribute('value') && !label.textContent) {
				label.textContent = label.getAttribute('value');
				label.removeAttribute('value');
			}
		}

		// Clean the search term but keep the original -
		//displaying with diacritics removed is confusing
		let termForDisplay = Zotero.Utilities.trimInternal(term).toLowerCase();
		term = this._normalizeSearch(term);

		for (let container of this.content.children) {
			let root = container.firstElementChild;
			if (!root) continue;

			for (let child of root.children) {
				let matches = this._findNodesMatching(child, term);
				if (matches.length) {
					let touchedTabPanels = new Set();
					for (let node of matches) {
						if (node.nodeType === Node.TEXT_NODE) {
							// For text nodes, add a native highlight on the matched range
							let value = node.nodeValue.toLowerCase();
							let index = value.indexOf(term);
							if (index == -1) continue; // Should not happen

							let range = document.createRange();
							range.setStart(node, index);
							range.setEnd(node, index + term.length);
							this._getSearchSelection().addRange(range);
						}
						else if (node.nodeType == Node.ELEMENT_NODE) {
							// For element nodes, wrap the element and add a tooltip
							// (So please don't use .parentElement etc. in event listeners)

							// Structure:
							// hbox.search-tooltip-parent
							//   | <node>
							//   | span.search-tooltip
							//       | span
							//           | <termForDisplay>
							let tooltipParent = document.createXULElement('hbox');
							tooltipParent.className = 'search-tooltip-parent';
							node.replaceWith(tooltipParent);
							let tooltip = document.createElement('span');
							tooltip.className = 'search-tooltip';
							let tooltipText = document.createElement('span');
							tooltipText.append(termForDisplay);
							tooltip.append(tooltipText);
							tooltipParent.append(node, tooltip);

							// https://searchfox.org/mozilla-central/rev/703391c381f92a73d9a938cbe0d33ca64d94583b/browser/components/preferences/findInPage.js#689-691
							let tooltipRect = tooltip.getBoundingClientRect();
							tooltip.style.left = `calc(50% - ${tooltipRect.width / 2}px)`;
						}

						let tabPanel = this._closest(node, 'tabpanels > tabpanel');
						let tabPanels = tabPanel?.parentElement;
						if (tabPanels && !touchedTabPanels.has(tabPanels)) {
							let tab = tabPanels.getRelatedElement(tabPanel);
							if (tab.control) {
								tab.control.selectedItem = tab;
								touchedTabPanels.add(tabPanels);
							}
						}
					}
				}
				else {
					child.classList.add('hidden-by-search');
					child.ariaHidden = true;
				}
			}
		}
	},

	/**
	 * Search for the given term (case-insensitive) in the tree.
	 *
	 * @param {Element} root
	 * @param {String} term Must be normalized (normalizeSearch())
	 * @return {Node[]}
	 */
	_findNodesMatching(root, term) {
		const EXCLUDE_SELECTOR = 'input, [hidden="true"], [no-highlight]';

		let matched = new Set();
		let treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
		let currentNode;
		while ((currentNode = treeWalker.nextNode())) {
			if (this._closest(currentNode, EXCLUDE_SELECTOR)
					|| !currentNode.nodeValue
					|| currentNode.length < term.length) {
				continue;
			}
			if (this._normalizeSearch(currentNode.nodeValue).includes(term)) {
				let unhighlightableParent = this._closest(currentNode, 'menulist');
				if (unhighlightableParent) {
					matched.add(unhighlightableParent);
				}
				else {
					matched.add(currentNode);
				}
			}
		}

		for (let elem of root.querySelectorAll('[data-search-strings-raw], [data-search-strings]')) {
			if (elem.closest(EXCLUDE_SELECTOR)) {
				continue;
			}

			if (elem.hasAttribute('data-search-strings-raw')) {
				let rawStrings = elem.getAttribute('data-search-strings-raw')
					.split(',')
					.map(this._normalizeSearch)
					.filter(Boolean);
				if (rawStrings.some(s => s.includes(term))) {
					matched.add(elem);
					continue;
				}
			}

			if (elem.hasAttribute('data-search-strings')) {
				let stringKeys = elem.getAttribute('data-search-strings')
					.split(',')
					.map(s => s.trim())
					.filter(Boolean);
				for (let key of stringKeys) {
					if (Zotero.Intl.strings.hasOwnProperty(key)) {
						if (this._normalizeSearch(Zotero.Intl.strings[key]).includes(term)) {
							matched.add(elem);
							break;
						}
					}
					else if (this._normalizeSearch(Zotero.getString(key).replace(/%(\d+\$)?S/g, ''))
							.includes(term)) {
						matched.add(elem);
						break;
					}
				}
			}
		}

		return [...matched];
	},

	/**
	 * @param {String} s
	 * @return {String}
	 */
	_normalizeSearch(s) {
		return Zotero.Utilities.removeDiacritics(
			Zotero.Utilities.trimInternal(s).toLowerCase(),
			true);
	},

	/**
	 * @return {Selection}
	 */
	_getSearchSelection() {
		// https://searchfox.org/mozilla-central/rev/703391c381f92a73d9a938cbe0d33ca64d94583b/browser/components/preferences/findInPage.js#226-239
		let controller = window.docShell
			.QueryInterface(Ci.nsIInterfaceRequestor)
			.getInterface(Ci.nsISelectionDisplay)
			.QueryInterface(Ci.nsISelectionController);
		let selection = controller.getSelection(
			Ci.nsISelectionController.SELECTION_FIND
		);
		selection.setColors('currentColor', '#ffe900', 'currentColor', '#003eaa');
		return selection;
	},

	/**
	 * Like {@link Element#closest} for all nodes.
	 *
	 * @param {Node} node
	 * @param {String} selector
	 * @return {Element | null}
	 */
	_closest(node, selector) {
		while (node && node.nodeType != Node.ELEMENT_NODE) {
			node = node.parentNode;
		}
		return node?.closest(selector);
	},
	
	/**
	 * @deprecated Use {@link Zotero.launchURL}
	 */
	openURL: function (url) {
		Zotero.warn("Zotero_Preferences.openURL() is deprecated -- use Zotero.launchURL()");
		Zotero.launchURL(url);
	}
};
