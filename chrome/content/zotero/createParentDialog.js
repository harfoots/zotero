"use strict";

var io;
let createParent;

function toggleAccept(enabled) {
	document.querySelector('dialog').getButton("accept").disabled = !enabled;
}

function doLoad() {
	// Set font size from pref
	let sbc = document.getElementById('zotero-create-parent-container');
	Zotero.setFontSize(sbc);

	io = window.arguments[0];

	createParent = document.getElementById('create-parent');
	const root = Zotero.CreateParent.createRoot(createParent);
	root.render({
		loading: false,
		item: io.dataIn.item,
		toggleAccept
	});

	document.addEventListener('dialogaccept', (event) => {
		doAccept();
		event.preventDefault();
	});
	document.addEventListener('dialogextra2', doManualEntry);
}

function doUnload() {
	Zotero.CreateParent.destroy(createParent);
}

async function doAccept() {
	let textBox = document.getElementById('parent-item-identifier');
	let childItem = io.dataIn.item;
	let newItems = await Zotero_Lookup.addItemsFromIdentifier(
		textBox,
		childItem,
		(on) => {
			// Render react again with correct loading value
			const root = Zotero.CreateParent.createRoot(createParent);
			root.render({
				loading: on,
				item: childItem,
				toggleAccept
			});
		}
	);

	// If we successfully created a parent, return it
	if (newItems) {
		io.dataOut = { parent: newItems[0] };
		window.close();
	}
}

function doManualEntry() {
	io.dataOut = { parent: false };
	window.close();
}