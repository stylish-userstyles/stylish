Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

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

var SourceEditor = null;
var se = null;
function init() {

	nameE = document.getElementById("name");
	tagsE = document.getElementById("tags");
	updateUrlE = document.getElementById("update-url")
	strings = document.getElementById("strings");
	codeE = document.getElementById("internal-code");

	initStyle();

	if (prefs.getIntPref("editor") == 0) {
		// orion, if available
		var obj = {};
		try {
			Components.utils.import("resource:///modules/source-editor.jsm", obj);
		} catch (ex) {
			try {
				// (moved circa firefox 27)
				Components.utils.import("resource:///modules/devtools/sourceeditor/source-editor.jsm", obj);
			} catch (ex) {
				// orion not available, use textbox
				init2();
				return;
			}
		}
		// check orion's pref
		if (Services.prefs.getCharPref(obj.SourceEditor.PREFS.COMPONENT) == "textarea") {
			init2();
		} else {
			// use orion
			SourceEditor = obj.SourceEditor;
			initOrion();
		}
	} else {
		// textbox
		init2()
	}
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
		codeElementWrapper.value = style.code;
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
		
		se = new SourceEditor();
		var orionElement = document.getElementById("orion");
		se.init(orionElement, {mode: SourceEditor.MODES.CSS, showLineNumbers: true, placeholderText: style.code}, init2);
		document.getElementById("editor").selectedIndex = 1;
		var appInfo = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
		var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"].getService(Components.interfaces.nsIVersionComparator);
		// before firefox 11, we need to set up our own undo key binding
		if ((appInfo.ID == "{ec8030f7-c20a-464f-9b0e-13a3a9e97384}" || appInfo.ID == "{3550f703-e582-4d05-9a08-453d09bdfdc6}") && versionChecker.compare(appInfo.version, "11.0a1") < 0) {
			orionElement.addEventListener("keypress", handleOrionUndo, false);
		}
		window.controllers.insertControllerAt(0, undoController);
}

function init2() {

	if (SourceEditor) {
		se.addEventListener("ContextMenu", handleOrionContext, false);
	} else {
		var wrapLines = prefs.getBoolPref("wrap_lines");
		refreshWordWrap(wrapLines);
		var wrapLinesE = document.getElementById("wrap-lines");
		wrapLinesE.checked = wrapLines;
		wrapLinesE.style.display = "";
	}

	setTimeout(function(){
		// the code returned is different for some reason a little later...
		initialCode = codeElementWrapper.value;
		// this doesn't work till "later" either
		codeElementWrapper.setSelectionRange(0, 0);
	},100);
}

function handleOrionUndo(event) {
	if (event.ctrlKey) {
		if (event.which == 122 || event.which == 90) { // Z
			if (event.shiftKey) {
				se.redo();
			} else {
				se.undo()
			}
		} else if (event.which == 121 || event.which == 89) { // Y
			se.redo();
		}
	}
}

var undoController = {
	doCommand: function(command) {
		if (command == "stylish_cmd_undo") {
			se.undo();
		}
	},

	isCommandEnabled: function(command) {
		if (command == "stylish_cmd_undo") {
			return se.canUndo();
		}
	},

	supportsCommand: function(command) {
		return command == "stylish_cmd_undo";
	},

	onEvent: function() {}
}

/*
gEditUIVisible = false;
function goDoCommand(a) {
	switch (a) {
		case "cmd_undo":
			se.undo();
			break;
		case "cmd_copy":
			se._view.invokeAction("copy");
			break;
		case "cmd_cut":
			se._view.invokeAction("cut");
			break;
		case "cmd_paste":
			se._view.invokeAction("paste");
			break;
		case "cmd_delete":
			se._view.invokeAction("deleteNext");
			break;
		case "cmd_selectAll":
			se._view.invokeAction("selectAll");
			break;
		default:
			throw "Unknown command " + a;
	}
}

function goUpdateCommand(a) {
	if (!se) {
		return;
	}
	var element = document.getElementById(a);
	switch (a) {
		case "cmd_undo":
			element.setAttribute("disabled", !se.canUndo());
			break;
		case "cmd_copy":
		case "cmd_cut":
		case "cmd_delete":
			var s = se.getSelection();
			element.setAttribute("disabled", s.start == s.end);
			break;
		case "cmd_paste":
			var t = se._view._getClipboardText();
			element.setAttribute("disabled", t == null || t.length == 0);
	}
}*/

function handleOrionContext(event) {
	se.focus();
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
		installCallback(saved ? "success" : "cancelled");
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
	var currentScrollTop = codeElementWrapper.scrollTop;
	var selectionEnd = codeElementWrapper.selectionStart + snippet.length;
	codeElementWrapper.value = codeElementWrapper.value.substring(0, codeElementWrapper.selectionStart) + snippet + codeElementWrapper.value.substring(codeElementWrapper.selectionEnd, codeElementWrapper.value.length);
	codeElementWrapper.focus();
	codeElementWrapper.scrollTop = currentScrollTop;
	codeElementWrapper.setSelectionRange(selectionEnd, selectionEnd);
}

function changeWordWrap(on) {
	prefs = Services.prefs.getBranch("extensions.stylish.");
	prefs.setBoolPref("wrap_lines", on);
	refreshWordWrap(on);
}

function refreshWordWrap(on) {
	codeE.setAttribute("wrap", on ? "on" : "off");
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

var finder = {
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

var codeElementWrapper = {
	get value() {
		if (SourceEditor) {
			return se.getText();
		}
		return codeE.value;
	},

	set value(v) {
		if (SourceEditor) {
			se.setText(v);
		} else {
			codeE.value = v;
		}
	},

	setSelectionRange: function(start, end) {
		if (SourceEditor) {
			se.setSelection(start, end);
		} else {
			codeE.setSelectionRange(start, end);
		}
	},

	focus: function() {
		if (SourceEditor) {
			se.focus();
		} else {
			codeE.focus();
		}
	},

	get selectionStart() {
		if (SourceEditor) {
			return se.getSelection().start;
		}
		return codeE.selectionStart;
	},

	get selectionEnd() {
		if (SourceEditor) {
			return se.getSelection().end;
		}
		return codeE.selectionEnd;
	},

	get scrollTop() {
		return this.scrollElement.scrollTop;
	},

	set scrollTop(t) {
		this.scrollElement.scrollTop = t;
	},

	get scrollElement() {
		if (SourceEditor) {
			return se._view._viewDiv;
		}
		return codeE.inputField;
	}

}

window.addEventListener("load", function() {
	var findBar = document.getElementById("findbar");
	document.getElementById("internal-code").fastFind = finder;
	findBar.open();
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
