Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
var require = null;
var autocompleter = null;
try {
	require = Components.utils.import("resource://gre/modules/devtools/Loader.jsm", {}).devtools.require;
	autocompleter = require("devtools/sourceeditor/autocomplete");
} catch (ex) {
	// file not available...
}

var saved = false;
var style = null;
var strings = null;
var codeE, nameE, tagsE, updateUrlE;
var installPingURL = null;
var installCallback = null;
//because some editors can have different CRLF settings than what we've saved as, we'll only save if the code in the editor has changed. this will prevent update notifications when there are none
var initialCode;
var prefs = Services.prefs.getBranch("extensions.stylish.");

const CSSXULNS = "@namespace url(http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul);";
const CSSHTMLNS = "@namespace url(http://www.w3.org/1999/xhtml);";

var sourceEditorType = null;
var sourceEditor = null;
function init() {
	nameE = document.getElementById("name");
	tagsE = document.getElementById("tags");
	updateUrlE = document.getElementById("update-url")
	strings = document.getElementById("strings");
	codeE = document.getElementById("internal-code");

	initStyle();

	if (prefs.getIntPref("editor") == 0) {
		// sourceeditor, firefox 27+
		let Editor = null;
		if (require) {
			try {
				Editor = require("devtools/sourceeditor/editor");
			} catch (ex) {
				//unavailable
			}
		}
		if (Editor && ("modes" in Editor)) {
			document.getElementById("itsalltext").style.visibility = "hidden";
			sourceEditor = new Editor({
				mode: Editor.modes.css,
				lineNumbers: true,
				contextMenu: "orion-context",
				value: style.code
			});
			var sourceEditorElement = document.getElementById("sourceeditor");
			document.getElementById("editor").selectedIndex = 2;
			sourceEditorType = "sourceeditor";
			sourceEditor.appendTo(sourceEditorElement).then(init2);
			// this seems to eat all Ctrl keypresses
			sourceEditorElement.addEventListener("keydown", function(event) {
				// Ctrl+S
				if (event.ctrlKey && event.keyCode == 83) {
					saveAndClose();
				}
			});
			return;
		}
		
		// orion, firefox 8-26
		var obj = {};
		try {
			Components.utils.import("resource:///modules/source-editor.jsm", obj);
		} catch (ex) {
			try {
				// (moved circa firefox 27)
				Components.utils.import("resource:///modules/devtools/sourceeditor/source-editor.jsm", obj);
			} catch (ex) {
				// orion not available
			}
		}
		// check orion's pref
		if ("SourceEditor" in obj && Services.prefs.getCharPref(obj.SourceEditor.PREFS.COMPONENT) != "textarea") {
			// use orion
			sourceEditor = new obj.SourceEditor();
			sourceEditorType = "orion";
			initOrion();
			return;
		}
	}
	// textbox
	sourceEditorType = "textarea";
	sourceEditor = codeE;
	setTimeout(init2, 100);
}

function initStyle() {
	var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);

	// See if the ID is in the URL
	var id;
	var urlParts = location.href.split("?");
	if (urlParts.length > 1) {
		params = urlParts[1].split("&");
		params.forEach(function(param) {
			var kv = param.split("=");
			if (kv.length > 1 && kv[0] == "id") {
				id = kv[1];
			}
		});
	}
	if (id) {
		style = service.find(id, service.CALCULATE_META | service.REGISTER_STYLE_ON_CHANGE);

	// See the arguments passed in
	} else if (window.arguments) {
		if ("id" in window.arguments[0]) {
			style = service.find(window.arguments[0].id, service.CALCULATE_META | service.REGISTER_STYLE_ON_CHANGE);
		} else if ("style" in window.arguments[0]) {
			style = window.arguments[0].style;
			style.mode = service.CALCULATE_META | service.REGISTER_STYLE_ON_CHANGE;
		}
		installPingURL = window.arguments[0].installPingURL;
		installCallback = window.arguments[0].installCallback;
		document.documentElement.setAttribute("windowtype", window.arguments[0].windowType);
	}

	if (style) {
		nameE.value = style.name;
		tagsE.value = style.getMeta("tag", {}).join(" ");
		updateUrlE.value = style.updateUrl;
		// if the style already has an id, it's been previously saved, so this is an edit
		// if the style has no id but has a url, it's an install
		document.documentElement.getButton("extra1").hidden = style.id || !style.url;
		if (style.id) {
			document.title = strings.getFormattedString("editstyletitle", [style.name]);
		} else {
			document.title = strings.getString("newstyletitle");
		}
	} else {
		style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
		document.documentElement.getButton("extra1").hidden = true;
		document.title = strings.getString("newstyletitle");
	}
}

function initOrion() {
		// orion and it's all text don't get along. it's all text will update display later, so let's use visibility
		document.getElementById("itsalltext").style.visibility = "hidden";
		
		var orionElement = document.getElementById("orion");
		sourceEditor.init(orionElement, {mode: sourceEditor.MODES.CSS, showLineNumbers: true}, init2);
		document.getElementById("editor").selectedIndex = 1;
		window.controllers.insertControllerAt(0, undoController);
		// only use our custom undo
		document.getElementById("menu_undo").style.display = "none";
		document.getElementById("stylish_menu_undo").style.display = "";
}

function init2() {

	if (sourceEditorType == "orion") {
		sourceEditor.addEventListener("ContextMenu", handleOrionContext, false);
	}
	if (sourceEditorType == "textarea" || (sourceEditorType == "sourceeditor" && "setOption" in sourceEditor)) {
		var wrapLines = prefs.getBoolPref("wrap_lines");
		refreshWordWrap(wrapLines);
		var wrapLinesE = document.getElementById("wrap-lines");
		wrapLinesE.checked = wrapLines;
		wrapLinesE.style.display = "";
	}
	var autocompleteEnabled = false;
	try {
		autocompleteEnabled = Services.prefs.getBoolPref("devtools.styleeditor.autocompletion-enabled");
	} catch (ex) {}
	if (sourceEditorType == "sourceeditor" && autocompleteEnabled) {
		// Up to Firefox 28, sometimes "require" will return an object when something is not available instead of throwing.
		// Rather than trying to detect if autocompleter is available, let's just try to use it.
		try {
			sourceEditor.extend(autocompleter);
			sourceEditor.setupAutoCompletion(null);
		} catch (ex) { }
	}

	// the initial value for sourceeditor is set in the Editor constructor, which has the benefit of not being undoable
	if (sourceEditorType != "sourceeditor") {
		codeElementWrapper.value = style.code;
	}

	setTimeout(function(){
		// the code returned is different for some reason a little later...
		initialCode = codeElementWrapper.value;
		// this doesn't work till "later" either
		if (sourceEditorType != "sourceeditor") {
			codeElementWrapper.setSelectionRange(0, 0);
		}
	},100);
}

var undoController = {
	doCommand: function(command) {
		if (command == "stylish_cmd_undo") {
			sourceEditor.undo();
		}
	},

	isCommandEnabled: function(command) {
		if (command == "stylish_cmd_undo") {
			return sourceEditor.canUndo();
		}
	},

	supportsCommand: function(command) {
		return command == "stylish_cmd_undo";
	},

	onEvent: function() {}
}

function handleOrionContext(event) {
	sourceEditor.focus();
	goUpdateGlobalEditMenuItems();
	goUpdateCommand("stylish_cmd_undo");
	var menu = document.getElementById("orion-context");
	if (menu.state == "closed") {
		menu.openPopupAtScreen(event.screenX, event.screenY, true);
	}
}

function switchToInstall() {
	Services.prefs.setBoolPref("extensions.stylish.editOnInstall", false);
	style.name = nameE.value;
	if (codeElementWrapper.value != initialCode) {
		style.code = codeElementWrapper.value;
	}
	stylishCommon.openInstall({style: style, installPingURL: installPingURL, installCallback: installCallback});
	window.close();
}

function saveAndClose() {
	if (save()) {
		close();
	}
}

function save() {
	style.name = nameE.value;
	if (!style.name) {
		alert(strings.getString("missingname"));
		return false;
	}
	var code = codeElementWrapper.value;
	if (!code) {
		alert(strings.getString("missingcode"));
		return false;
	}

	if (!style.id)
		// new styles start out enabled
		style.enabled = true;
	else if (!style.enabled)
		// turn off preview for previously saved disabled styles to avoid flicker
		style.setPreview(false);

	if (code != initialCode) {
		style.code = code;
	} else {
		// we don't want to change the code, but we want to undo any preview
		style.revert();
	}

	style.removeAllMeta("tag")
	stylishCommon.cleanTags(tagsE.value).forEach(function(v) {
		style.addMeta("tag", v);
	});
	style.updateUrl = updateUrlE.value;
	style.save();
	saved = true;
	if (installPingURL) {
		var req = new XMLHttpRequest();
		req.open("GET", installPingURL, true);
		stylishCommon.fixXHR(req);
		req.send(null);
	}

	return true;
}

function preview() {
	style.name = nameE.value;
	style.code = codeElementWrapper.value;
	checkForErrors();
	// delay this so checkForErrors doesn't pick up on what happens
	setTimeout(function() { style.setPreview(true);}, 50);
}

function cancelDialog() {
	if (!saved && initialCode != codeElementWrapper.value) {
		var ps = Components.interfaces.nsIPromptService
		var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(ps);
		switch (promptService.confirmEx(window, strings.getString("unsavedchangestitle"), strings.getString("unsavedchanges"), ps.BUTTON_POS_0 * ps.BUTTON_TITLE_SAVE + ps.BUTTON_POS_1 * ps.BUTTON_TITLE_DONT_SAVE + ps.BUTTON_POS_2 * ps.BUTTON_TITLE_CANCEL, "", "", "", null, {})) {
			case 0:
				return save();
			case 1:
				return true;
			case 2:
				return false;
		}
	}
	return true;
}

function dialogClosing() {
	//turn off preview!
	style.setPreview(false);
	if (!saved) {
		style.revert();
	}
	
	if (installCallback) {
		installCallback(saved ? "installed" : "cancelled");
	}
}

function checkForErrors() {
	var service = Components.classes["@userstyles.org/style;1"].getService(Components.interfaces.stylishStyle);
	var errors = document.getElementById("errors");
	errors.style.display = "none";
	while (errors.hasChildNodes()) {
		errors.removeChild(errors.lastChild);
	}
	var currentMessages = [];
	var errorListener = {
		QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsIConsoleListener, Components.interfaces.nsISupports]),
		observe: function(message) {
			if ("QueryInterface" in message) {
				errors.style.display = "-moz-box";
				var error = message.QueryInterface(Components.interfaces.nsIScriptError);
				
				// ignore other crap
				if (error.category == "CSS Parser" && error.sourceName == "about:blank") {
					var message = error.lineNumber + ":" + error.columnNumber + " " + error.errorMessage;
					// don't duplicate
					if (currentMessages.indexOf(message) == -1) {
						currentMessages.push(message);
						var label = document.createElementNS(stylishCommon.XULNS, "label");
						label.appendChild(document.createTextNode(message));
						label.addEventListener("click", function() {goToLine(error.lineNumber, error.columnNumber) }, false);
						errors.appendChild(label);
					}
				}
			}
		}
	}
	style.checkForErrors(codeElementWrapper.value, errorListener);
}

function goToLine(line, col) {
	if (sourceEditorType == "sourceeditor") {
		codeElementWrapper.focus();
		sourceEditor.setCursor({line: line - 1, ch: col});
		return;
	}
	var index = 0;
	var currentLine = 1;
	while (currentLine < line) {
		index = codeElementWrapper.value.indexOf("\n", index) + 1;
		currentLine++;
	}
	codeElementWrapper.focus();
	codeElementWrapper.setSelectionRange(index + col, index + col);
}

//Insert the snippet at the start of the code textbox or highlight it if it's already in there
function insertCodeAtStart(snippet) {
	var position = codeElementWrapper.value.indexOf(snippet);
	if (position == -1) {
		//insert the code
		//put some line breaks in if there's already code there
		if (codeElementWrapper.value.length > 0) {
			codeElementWrapper.value = snippet + "\n" + codeElementWrapper.value;
		} else {
			codeElementWrapper.value = snippet + "\n";
		}
	}
	//highlight it
	codeElementWrapper.setSelectionRange(snippet.length + 1, snippet.length + 1);
	codeElementWrapper.focus();
}

function insertCodeAtCaret(snippet) {
	var selectionStart = codeElementWrapper.selectionStart;
	var selectionEnd = selectionStart + snippet.length;
	// sourceditor is good at keeping the scroll position, but others are not
	if (sourceEditorType != "sourceeditor") {
		var currentScrollTop = codeElementWrapper.scrollTop;
	}
	codeElementWrapper.value = codeElementWrapper.value.substring(0, codeElementWrapper.selectionStart) + snippet + codeElementWrapper.value.substring(codeElementWrapper.selectionEnd, codeElementWrapper.value.length);
	codeElementWrapper.focus();
	if (sourceEditorType != "sourceeditor") {
		codeElementWrapper.scrollTop = currentScrollTop;
	}
	codeElementWrapper.setSelectionRange(selectionStart, selectionEnd);
}

function changeWordWrap(on) {
	prefs = Services.prefs.getBranch("extensions.stylish.");
	prefs.setBoolPref("wrap_lines", on);
	refreshWordWrap(on);
}

function refreshWordWrap(on) {
	if (sourceEditorType == "textarea") {
		codeE.setAttribute("wrap", on ? "on" : "off");
	} else if (sourceEditorType == "sourceeditor") {
		sourceEditor.setOption("lineWrapping", on);
	}
}

function insertChromePath() {
	var ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
	var fileHandler = ios.getProtocolHandler("file").QueryInterface(Components.interfaces.nsIFileProtocolHandler);
	var chromePath = fileHandler.getURLSpecFromFile(Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties).get("UChrm", Components.interfaces.nsIFile));
	insertCodeAtCaret(chromePath);
}

function insertDataURI() {
	const ci = Components.interfaces;
	const cc = Components.classes;
	const nsIFilePicker = ci.nsIFilePicker;
	var fp = cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
	fp.init(window, strings.getString("dataURIDialogTitle"), nsIFilePicker.modeOpen);
	if (fp.show() != nsIFilePicker.returnOK) {
		return;
	}
	var file = fp.file;
	var contentType = cc["@mozilla.org/mime;1"].getService(ci.nsIMIMEService).getTypeFromFile(file);
	var inputStream = cc["@mozilla.org/network/file-input-stream;1"].createInstance(ci.nsIFileInputStream);
	inputStream.init(file, 0x01, 0600, 0);
	var stream = cc["@mozilla.org/binaryinputstream;1"].createInstance(ci.nsIBinaryInputStream);
	stream.setInputStream(inputStream);
	var encoded = btoa(stream.readBytes(stream.available()));
	stream.close();
	inputStream.close();
	insertCodeAtCaret("data:" + contentType + ";base64," + encoded);
}

// Firefox 27 changed this interface
var finderJsmStyle = false;
try {
	Components.utils.import("resource://gre/modules/Finder.jsm", {});
	finderJsmStyle = true;
} catch (ex) {
	// file not available...
}

var finder = null;
if (finderJsmStyle) {
	finder = {
		_listeners: [],
		searchString: null,
		caseSensitive: false,

		addResultListener: function (aListener) {
			if (this._listeners.indexOf(aListener) === -1)
				this._listeners.push(aListener);
		},

		removeResultListener: function (aListener) {
			this._listeners = this._listeners.filter(function(l) {return l != aListener;});
		},

		_notify: function (aSearchString, aResult, aFindBackwards, aDrawOutline) {
			this.searchString = aSearchString;

			let data = {
				result: aResult,
				findBackwards: aFindBackwards,
				linkURL: null,
				rect: {top: 0, right: 0, bottom: 0, left: 0},
				searchString: this._searchString,
			};

			this._listeners.forEach(function(l) {
				l.onFindResult(data);
			});
		},

		fastFind: function(aSearchString, aLinksOnly, aDrawOutline) {
			this.searchString = aSearchString;
			let result = this._findFromIndex(0, false);
			this._notify(aSearchString, result, false, aDrawOutline);
		},

		findAgain: function(aFindBackwards, aLinksOnly, aDrawOutline) {
			let result = this._findFromIndex(codeElementWrapper.selectionStart + (aFindBackwards ? 0 : 1), aFindBackwards);
			this._notify(this.searchString, result, aFindBackwards, aDrawOutline);
		},

		_findFromIndex: function(index, backwards) {
			var start = backwards ? codeElementWrapper.value.substring(0, index).lastIndexOf(this.searchString) : codeElementWrapper.value.indexOf(this.searchString, index);
			var result;
			var iface = Components.interfaces.nsITypeAheadFind;
			if (start >= 0) {
				result = iface.FIND_FOUND;
			} else if (index == 0) {
				result = iface.FIND_NOTFOUND;
			} else {
				// try again, start from the start
				start = backwards ? codeElementWrapper.value.lastIndexOf(this.searchString) : codeElementWrapper.value.indexOf(this.searchString);
				result = start == -1 ? iface.FIND_NOTFOUND : iface.FIND_WRAPPED;
			}
			codeE.editor.selection.removeAllRanges();
			if (start >= 0) {
				codeElementWrapper.setSelectionRange(start, start + this.searchString.length);
				codeE.editor.selectionController.setDisplaySelection(2);
				codeE.editor.selectionController.scrollSelectionIntoView(1, 0, false);
			} else
				codeElementWrapper.setSelectionRange(0, 0);
			return result;
		},

		highlight: function(aHighlight, aWord) {},
		enableSelection: function() {},
		removeSelection: function() {},
		focusContent: function() {},
		keyPress: function (aEvent) {}
	};
} else {
	finder = {
		QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsITypeAheadFind, Components.interfaces.nsISupports]),
		nsITAF: Components.interfaces.nsITypeAheadFind,

		init: function(docshell) {},

		find: function(s, linksOnly) {
			this.searchString = s;
			return this.findFromIndex(0, false);
		},

		findAgain: function(backwards, linksOnly) {
			return this.findFromIndex(codeElementWrapper.selectionStart + (backwards ? 0 : 1), backwards);
		},

		findFromIndex: function(index, backwards) {
			var start = backwards ? codeElementWrapper.value.substring(0, index).lastIndexOf(this.searchString) : codeElementWrapper.value.indexOf(this.searchString, index);
			var result;
			if (start >= 0) {
				result = this.nsITAF.FIND_FOUND;
			} else if (index == 0) {
				result = this.nsITAF.FIND_NOTFOUND;
			} else {
				// try again, start from the start
				start = backwards ? codeElementWrapper.value.lastIndexOf(this.searchString) : codeElementWrapper.value.indexOf(this.searchString);
				result = start == -1 ? this.nsITAF.FIND_NOTFOUND : this.nsITAF.FIND_WRAPPED;
			}
			codeE.editor.selection.removeAllRanges();
			if (start >= 0) {
				codeElementWrapper.setSelectionRange(start, start + this.searchString.length);
				codeE.editor.selectionController.setDisplaySelection(2);
				codeE.editor.selectionController.scrollSelectionIntoView(1, 0, false);
			} else
				codeElementWrapper.setSelectionRange(0, 0);
			return result;
		},

		setDocShell: function(docshell) {},
		setSelectionModeAndRepaint: function(toggle) {},
		collapseSelection: function(toggle) {},

		searchString: null,
		caseSensitive: false,
		foundLink: null,
		foundEditable: null,
		currentWindow: null
	}
}

var codeElementWrapper = {
	get value() {
		if (sourceEditorType == "orion" || sourceEditorType == "sourceeditor") {
			return sourceEditor.getText();
		}
		return sourceEditor.value;
	},

	set value(v) {
		if (sourceEditorType == "orion" || sourceEditorType == "sourceeditor") {
			sourceEditor.setText(v);
		} else {
			sourceEditor.value = v;
		}
	},

	setSelectionRange: function(start, end) {
		if (sourceEditorType == "orion") {
			sourceEditor.setSelection(start, end);
		} else if (sourceEditorType == "sourceeditor") {
			sourceEditor.setSelection(sourceEditor.getPosition(start), sourceEditor.getPosition(end));
		} else {
			sourceEditor.setSelectionRange(start, end);
		}
	},

	focus: function() {
		sourceEditor.focus();
	},

	get selectionStart() {
		if (sourceEditorType == "orion") {
			return sourceEditor.getSelection().start;
		}
		if (sourceEditorType == "sourceeditor") {
			return sourceEditor.getOffset(sourceEditor.getCursor("start"));
		}
		return sourceEditor.selectionStart;
	},

	get selectionEnd() {
		if (sourceEditorType == "orion") {
			return sourceEditor.getSelection().end;
		}
		if (sourceEditorType == "sourceeditor") {
			return sourceEditor.getOffset(sourceEditor.getCursor("end"));
		}
		return sourceEditor.selectionEnd;
	},

	get scrollTop() {
		return this.scrollElement.scrollTop;
	},

	set scrollTop(t) {
		this.scrollElement.scrollTop = t;
	},

	get scrollElement() {
		if (sourceEditorType == "orion") {
			return sourceEditor._view._viewDiv;
		}
		return sourceEditor.inputField;
	}

}

window.addEventListener("load", function() {
	// sourceeditor has its own way of doing this
	if (sourceEditorType != "sourceeditor") {
		var findBar = document.getElementById("findbar");
		if (finderJsmStyle) {
			var editor = document.getElementById("internal-code");
			editor.finder = finder;
			findBar.browser = editor;
		} else {
			document.getElementById("internal-code").fastFind = finder;
		}
		findBar._findField.value = "";
		findBar.open();
	}
	// On the find bar, swallow any enter keypresses that would close the dialog
	document.getElementById("findbar").addEventListener("keypress", function(event) {
		if (event.keyCode == 13) {
			// why this is different, i don't know
			if (!finderJsmStyle) {
				event.target._findAgain();
			}
			event.preventDefault();
		}
	}, false);
}, false);

// if the style we're editing has been deleted, turn off preview and close the window
var deleteObserver = {
	observe: function(subject, topic, data) {
		if (subject.id == style.id) {
			style.enabled = false;
			style.setPreview(false);
			// just so the user is not prompted to save
			saved = true;
			window.close();
		}
	}
};
Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService).addObserver(deleteObserver, "stylish-style-delete", false);
