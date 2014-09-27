Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function Style() {
	this.id = 0;
	this.url = null;
	this.idUrl = null;
	this.updateUrl = null;
	this.md5Url = null;
	this.originalCode = null;
	this.originalMd5 = null;
	this.appliedInfo = null;
	this.lastSavedCode = null;
	this.applyBackgroundUpdates = null;
	this.mode = this.CALCULATE_META | this.REGISTER_STYLE_ON_CHANGE;

	//these have getters and setters
	this._name = null;
	this._code = null;
	this._enabled = false;

	this.meta = [];
 

	this.previewOn = false;
	this.appliedInfoToBeCalculated = false;
}
Style.prototype = {

	/*
		nsISupports
	*/
	QueryInterface: XPCOMUtils.generateQI([Components.interfaces.stylishStyle, Components.interfaces.nsIClassInfo, Components.interfaces.nsISupports]),


	/*
		nsIClassInfo
	*/
	getInterfaces: function getInterfaces(aCount) {
		var interfaces = [Components.interfaces.stylishStyle, Components.interfaces.nsIClassInfo, Components.interfaces.nsISupports];
		aCount.value = interfaces.length;
		return interfaces;
	},
	getHelperForLanguage: function getHelperForLanguage(aLanguage) {
		return null;
	},
	classDescription: "Stylish Style",
	classID: Components.ID("{ea17a766-cdd4-444b-8d8d-b5bb935a2a22}"),
	contractID: "@userstyles.org/style;1",
	implementationLanguage: Components.interfaces.nsIProgrammingLanguage.JAVASCRIPT,
	flags: 0,


	/*
		stylishStyle static methods
	*/
	CALCULATE_META: 1,
	REGISTER_STYLE_ON_CHANGE: 2,
	REGISTER_STYLE_ON_LOAD: 4,
	INTERNAL_LOAD_EVENT: 8,
	UNREGISTER_STYLE_ON_LOAD: 16,

	list: function(mode, count) {
		var styles = this.findSql("SELECT * FROM styles;", {}, mode);
		count.value = styles.length;
		return styles;
	},

	find: function(id, mode, connection) {
		var styles = this.findSql("SELECT * FROM styles WHERE id = :id;", {id: id}, mode, connection);
		return styles.length > 0 ? styles[0] : null;
	},

	findByUrl: function(url, mode) {
		var styles = this.findSql("SELECT * FROM styles WHERE idUrl = :url;", {url: url}, mode);
		return styles.length > 0 ? styles[0] : null;
	},

	findEnabled: function(enabled, mode, count) {
		var styles = this.findSql("SELECT * FROM styles WHERE enabled = :enabled;", {enabled: enabled}, mode);
		count.value = styles.length;
		return styles;
	},

	findForUrl: function(url, includeGlobal, mode, count) {
		var styles = this.list(mode, {});
		styles = styles.filter(function(style) {
			return style.appliesToUrl(url) || (includeGlobal && style.getTypes({}).indexOf("global") > -1);
		});
		count.value = styles.length;
		return styles;
	},

	findByMeta: function(name, value, mode, count) {
		var that = this;
		var connection = this.getConnection();
		var statement = connection.createStatement("SELECT style_id FROM style_meta WHERE style_meta.name = :name AND style_meta.value = :value;");
		try {
			this.bind(statement, "name", name);
			this.bind(statement, "value", value);
			var styles = [];
			while (statement.executeStep()) {
				styles.push(this.find(this.extract(statement, "style_id"), mode, connection));
			}
			count.value = styles.length;
			return styles;
		} catch (ex) {
			Components.utils.reportError(ex);
		} finally {
			statement.reset();
			statement.finalize();
			connection.close();
		}
	},

	checkForErrors: function(css, errorListener) {
		var consoleService = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
		consoleService.registerListener(errorListener);
		try {
			this.getStyleSheet(css);
		} finally {
			// do this on a delay because of https://bugzilla.mozilla.org/show_bug.cgi?id=831428
			Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer).initWithCallback(function() {consoleService.unregisterListener(errorListener)}, 10, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
		}
	},

	regexToSample: function(r) {
		// everything up to the first regex character
		var re = /[\.\(\)\[\]]/g;
		var match;
		while (match = re.exec(r)) {
			if (r[match.index - 1] != "\\") {
				break;
			}
		}
		// no regex characters found?
		if (match == null) {
			return this.unescapeRegexLiterals(r);
		}
		return this.unescapeRegexLiterals(r.substring(0, match.index)) + "...";
	},

	/*
		stylishStyle instance methods
	*/
	init: function(url, idUrl, updateUrl, md5Url, name, code, enabled, originalCode, originalMd5, applyBackgroundUpdates) {
		//the mode may contain a flag that indicates that this is a load rather than a new style
		var shouldRegister;
		if (this.mode & this.INTERNAL_LOAD_EVENT) {
			this.mode -= this.INTERNAL_LOAD_EVENT;
			shouldRegister = this.shouldRegisterOnLoad();
		} else {
			shouldRegister = this.shouldRegisterOnChange()
		}
		this.initInternal(url, idUrl, updateUrl, md5Url, name, code, enabled, originalCode, originalMd5, shouldRegister, applyBackgroundUpdates);
	},

	get name() {
		return this._name;
	},

	set name(name) {
		//reference appliedInfo to make sure it has been calculated before we change the name
		this.appliedInfo;
		this._name = name;
	},

	get code() {
		return this._code;
	},

	set code(code) {
		this.setCode(code, this.shouldRegisterOnChange());
	},

	get enabled() {
		return this._enabled;
	},

	set enabled(enabled) {
		if (this.enabled == enabled)
			//no-op
			return;
		if (enabled) {
			if (this.previewOn) {
				// switch from a preview mode to a normal enabled mode
				this.previewOn = false;
			} else {
				this.register();
			}
		} else if (!this.previewOn)
			this.unregister();
		this._enabled = enabled;
	},

	delete: function() {
		if (this.id == 0)
			throw "Style can't be deleted; it hasn't been saved.";
		this.unregister();
		var connection = this.getConnection();
		var statement = connection.createStatement("DELETE FROM styles WHERE id = :id;");
		this.bind(statement, "id", this.id);
		try {
			statement.execute();
		} finally {
			statement.reset();
			statement.finalize();
		}
		var statement = connection.createStatement("DELETE FROM style_meta WHERE style_id = :id;");
		this.bind(statement, "id", this.id);
		try {
			statement.execute();
		} finally {
			statement.reset();
			statement.finalize();
			connection.close();
		}

		Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService).notifyObservers(this, "stylish-style-delete", null);

		this.id = 0;
	},

	// the parameter is not passed from external calls
	save: function(reason) {
		var connection = this.getConnection();
		var statement;
		var newStyle = this.id == 0;

		var that = this;
		function b(name, value) {
			that.bind(statement, name, value);
		}
		if (this.id == 0) {
			statement = connection.createStatement("INSERT INTO styles (`url`, `idUrl`, `updateUrl`, `md5Url`, `name`, `code`, `enabled`, `originalCode`, `applyBackgroundUpdates`, `originalMd5`) VALUES (:url, :idUrl, :updateUrl, :md5Url, :name, :code, :enabled, :originalCode, :applyBackgroundUpdates, :originalMd5);");
		} else {
			statement = connection.createStatement("UPDATE styles SET `url` = :url, `idUrl` = :idUrl, `updateUrl` = :updateUrl, `md5Url` = :md5Url, `name` = :name, `code` = :code, `enabled` = :enabled, `originalCode` = :originalCode, `applyBackgroundUpdates` = :applyBackgroundUpdates, `originalMd5` = :originalMd5 WHERE `id` = :id;");
			b("id", this.id);
		}

		// style is not updatable, original code is useless
		if (!this.updateUrl && !this.md5Url) {
			this.originalCode = null;
			b("originalCode", this.originalCode);
		// original code matches current code, no need to remember original
		} else if (this.originalCode == this.code) {
			this.originalCode = null;
			b("originalCode", this.originalCode);
		// original code exists and is different, don't touch
		} else if (this.originalCode) {
			b("originalCode", this.originalCode);
		// style has changed
		} else if (this.lastSavedCode != this.code) {
			this.originalCode = this.lastSavedCode;
			b("originalCode", this.originalCode);
		} else {
			b("originalCode", null);
		}

		b("url", this.url);
		b("idUrl", this.idUrl);
		b("updateUrl", this.updateUrl);
		b("md5Url", this.md5Url);
		b("name", this.name);
		b("code", this.code);
		b("enabled", this.enabled);
		b("applyBackgroundUpdates", this.applyBackgroundUpdates);
		b("originalMd5", this.originalMd5);

		try {
			statement.execute();
		} catch (ex) {
			statement.reset();
			statement.finalize();
			var err = connection.lastError;
			var text = connection.lastErrorString;
			connection.close();
			if (err == 0)
				throw ex;
			throw err + " " + text;
		}
		if (newStyle)
			this.id = connection.lastInsertRowID;
		statement.reset();
		statement.finalize();

		//the saved code now matches the current code
		this.lastSavedCode = null;

		//now reload the metadata

		// group this stuff together as a transaction for better performance
		if (this.meta.length > 0) {
			try {
				connection.beginTransaction();
				//delete the previous calculated meta data
				if (!newStyle) {
					statement = connection.createStatement("DELETE FROM style_meta WHERE style_id = :id;");
					b("id", this.id);
					statement.execute();
					statement.finalize();
				}

				statement = connection.createStatement("INSERT INTO style_meta (`style_id`, `name`, `value`) VALUES (:id, :name, :value);");
				this.meta.forEach(function(a) {
					b("id", that.id);
					b("name", a[0]);
					b("value", a[1]);
					statement.execute();
				});
				connection.commitTransaction();
			} finally {
				statement.reset();
				statement.finalize();
			}
		}

		connection.close();

		Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService).notifyObservers(this, newStyle ? "stylish-style-add" : "stylish-style-change", reason || null);
	},

	appliesToUrl: function(url) {
		if (this.urlRules.some(function(rule) {
			return url == rule;
		}))
			return true;

		if (this.urlPrefixRules.some(function(rule) {
			return url.indexOf(rule) == 0;
		}))
			return true;
		var domain;
		//this can throw for weird urls like about:blank
		try {
			domain = this.ios.newURI(url, null, null).host;
		} catch (ex) {
			//Components.utils.reportError("'" + url + "' is not a URL.");
			return false;
		}
		if (this.domainRules.some(function(rule) {
			if (rule == domain)
				return true;
			var i = domain.lastIndexOf("." + rule);
			return i != -1 && (i + 1 + rule.length == domain.length);
		})) {
			return true;
		}
		return this.regexpRules.some(function(rule) {
			try {
				var re = new RegExp(rule);
			} catch (ex) {
				//bad regexp
				return false;
			}
			return re.test(url);
		});
	},

	//previewing make it so that the code for this style is always applied, even if it's disabled
	setPreview: function(on) {
		if (this.previewOn == on)
			//no-op
			return;
		//if this style is enabled, then preview doesn't really have an effect atm
		if (!this.enabled) {
			//if preview is being turned on, register the style
			if (on)
				this.register();
			else
				this.unregister();
		}
		this.previewOn = on;
	},

	//set the code back to the saved state
	revert: function() {
		if (this.lastSavedCode) {
			this.code = this.lastSavedCode;
			this.lastSavedCode = null;
		}
	},

	addMeta: function(name, value) {
		this.meta.push([name, value]);
	},

	removeMeta: function(name, value) {
		this.meta = this.meta.filter(function(e) {
			return e[0] != name || e[1] != value;
		});
	},

	removeAllMeta: function(name) {
		this.meta = this.meta.filter(function(e) {
			return e[0] != name;
		});
	},

	getMeta: function(name, count) {
		var vals = this.meta.filter(function(e) {
			return e[0] == name;
		}).map(function(e) {
			return e[1];
		});
		count.value = vals.length;
		return vals;
	},

	getTypes: function(count) {
		count.value = this.types.length;
		return this.types;
	},

	get md5() {
		if (this.originalMd5 != null) {
			return this.originalMd5;
		}
		//https://developer.mozilla.org/en/nsICryptoHash#Computing_the_Hash_of_a_String
		var converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
		converter.charset = "UTF-8";
		var result = {};
		var data = converter.convertToByteArray(this.originalCode || this.code, {});
		var ch = Components.classes["@mozilla.org/security/hash;1"].createInstance(Components.interfaces.nsICryptoHash);
		ch.init(ch.MD5);
		ch.update(data, data.length);
		var hash = ch.finish(false);
		function toHexString(charCode) {
			return ("0" + charCode.toString(16)).slice(-2);
		}
		return [toHexString(hash.charCodeAt(i)) for (i in hash)].join("");
	},

	checkForUpdates: function(observer) {
		var that = this;
		
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.notifyObservers(that, "stylish-style-update-check-start", null);
		if (observer) {
			observer.observe(that, "stylish-style-update-check-start", null);
		}

		function notifyDone(result) {
			observerService.notifyObservers(that, "stylish-style-update-check-done", result);
			if (observer) {
				observer.observe(that, "stylish-style-update-check-done", result);
			}
		}

		function handleFailure() {
			notifyDone("update-check-error");
		}

		//if we have a url for a hash, use that
		if (this.md5Url) {
			function handleMd5(text) {
				if (text.length != 32) {
					Components.utils.reportError("Could not update '" + that.name + "' - '" + that.md5Url + "' did not return a md5 hash.");
					notifyDone("no-update-available");
				} else if (text == that.md5) {
					notifyDone("no-update-available");
				} else {
					notifyDone("update-available");
				}
			}
			this.download(this.md5Url, handleMd5, handleFailure);
		//otherwise use the update URL which makes us download the full code
		} else if (this.updateUrl) {
			function handleUpdateUrl(text, contentType) {
				if (contentType != "text/css") {
					Components.utils.reportError("Could not update '" + that.name + "' - '" + that.updateUrl + "' returned content type '" + contentType + "'.");
					notifyDone("no-update-available");
				} else if (text.replace(/\s/g,"") == (that.originalCode || that.code).replace(/\s/g,"")) {
					notifyDone("no-update-available");
				} else {
					notifyDone("update-available");
				}
			}
			this.download(this.updateUrl, handleUpdateUrl, handleFailure);
		} else {
			notifyDone("no-update-possible");
		}
	},

	applyUpdate: function(observer) {
		var observerService = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
		observerService.notifyObservers(this, "stylish-style-update-start", null);

		var that = this;

		function notifyDone(result) {
			observerService.notifyObservers(that, "stylish-style-update-done", result);
			if (observer) {
				observer.observe(that, "stylish-style-update-done", result);
			}
		}

		function handleFailure() {
			notifyDone("update-failure");
		}
		function handleSuccess(code, contentType) {
			if (contentType != "text/css") {
				Components.utils.reportError("Could not update '" + that.name + "' - '" + that.updateUrl + "' returned content type '" + contentType + "'.");
				notifyDone("update-failure");
				return;
			}
			//we're back to being in sync
			that.originalCode = code;
			that.code = code;
			that.downloadMd5(that.md5Url, function(md5Sum) {
				if (md5Sum != null) {
					that.originalMd5 = md5Sum;
				}
				that.save("update");
				notifyDone("update-success");
			});
		}
		if (this.updateUrl) {
			this.download(this.updateUrl, handleSuccess, handleFailure);
		} else {
			notifyDone("no-update-possible");
		}
	},

	getPrettyAppliesTo: function(count) {
		var urls = this.getMeta("url", {});
		var urlPrefixes = this.getMeta("url-prefix", {});
		var domains = this.getMeta("domain", {});
		var regexps = this.getMeta("regexp", {});

		// eliminate subdomains where the root domain is provided
		domains = domains.filter(function(possibleSubdomain) {
			return !domains.some(function(possibleRootDomain) {
				return possibleSubdomain.endsWith("." + possibleRootDomain);
			});
		})

		// eliminate urls and url prefixes on that are on a domain specified
		function doesntMatchDomainRule(url) {
			var domain;
			//this can throw for weird urls like about:blank
			try {
				domain = this.ios.newURI(url, null, null).host;
			} catch (ex) {
				return true;
			}
			return !domains.some(function(d) {
				return domain == d || domain.endsWith("." + d);
			});
		}
		urls = urls.filter(doesntMatchDomainRule, this);
		urlPrefixes = urlPrefixes.filter(doesntMatchDomainRule, this);

		var r = domains
			.concat(urlPrefixes.map(function(up) { return up + "*" }))
			.concat(urls)
			.concat(regexps);

		count.value = r.length;
		return r;
	},

	/*
		private
	*/
	//can't hard-code because it may not be here when the prototype is created
	get ds() {
		var ds = Components.classes["@userstyles.org/stylish-data-source;1"].getService(Components.interfaces.stylishDataSource)
		this.__defineGetter__("ds", function() {
			return ds;
		});
		return ds;
	},
	HTMLNS: "http://www.w3.org/1999/xhtml",
	ios: Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService),
	sss: Components.classes["@mozilla.org/content/style-sheet-service;1"].getService(Components.interfaces.nsIStyleSheetService),

	getStyleSheet: function(code) {
		var parser = Components.classes["@mozilla.org/xmlextras/domparser;1"].createInstance(Components.interfaces.nsIDOMParser);
		var doc1 = parser.parseFromString("<html xmlns='" + this.HTMLNS + "'/>", "application/xhtml+xml");
		var doc = doc1.implementation.createDocument(this.HTMLNS, "stylish-parse", null)
		var style = doc.createElementNS(this.HTMLNS, "style");
		style.appendChild(doc.createTextNode(code));
		doc.documentElement.appendChild(style);
		return doc.styleSheets[0];

	},

	calculateInternalMeta: function() {
		if (!this.shouldCalculateMeta())
			return;

		var sheet = this.getStyleSheet(this._code);

		this.removeAllMeta("url");
		this.removeAllMeta("url-prefix");
		this.removeAllMeta("domain");
		this.removeAllMeta("regexp");
		this.removeAllMeta("type");

		Array.filter(sheet.cssRules, function(rule) {
			return rule instanceof Components.interfaces.nsIDOMCSSMozDocumentRule;
		}).forEach(function (rule) {
			// get the -moz-doc up to its opening bracket. note that the regexps can contain { too...
			var mozDoc = null;
			if (rule.cssRules.length > 0) {
				var firstSubruleIndex = rule.cssText.indexOf(rule.cssRules[0].cssText);
				if (firstSubruleIndex > -1) {
					// let's first try to go up to the first child rule and then chop off the last {
					mozDoc = rule.cssText.substring(0, firstSubruleIndex).substring(0, rule.cssText.lastIndexOf("{"));
				}
			}
			// if that doesn't work, then just go up to the first {
			if (mozDoc == null) {
				mozDoc = rule.cssText.substring(0, rule.cssText.indexOf("{"));
			}
			var re = /(?:(url|domain|url-prefix|regexp)\s*\('([^']+?)'\)\s*)|(?:(url|domain|url-prefix|regexp)\s*\("([^"]+?)"\)\s*),?\s*|(?:(url|domain|url-prefix)\s*\(([^\)]+?)\)\s*)/g;
			var match;
			while ((match = re.exec(mozDoc)) != null) {
				var type = match[1] || match[3] || match[5];
				var value = this.unescapeCss(match[2] || match[4] || match[6]);
				switch (type) {
					case "url":
						this.addMeta('url', value);
						break;
					case "url-prefix":
						this.addMeta('url-prefix', value);
						break;
					case "domain":
						this.addMeta('domain', value);
						break;
					case "regexp":
						this.addMeta('regexp', value);
						break;
					default:
						Components.utils.reportError("Unknown -moz-doc rule type '" + type + "'");
				}
			}
		}, this);

		var namespaces = Array.filter(sheet.cssRules, function(rule) {
			// available in fx 16+, bug 765590
			if ("NAMESPACE_RULE" in Components.interfaces.nsIDOMCSSRule) {
				return rule.type == Components.interfaces.nsIDOMCSSRule.NAMESPACE_RULE;
			}
			return rule.type == Components.interfaces.nsIDOMCSSRule.UNKNOWN_RULE && rule.cssText.indexOf("@namespace") == 0;
		}).map(function(rule) {
			var text = rule.cssText.replace(/\"/g, "");
			var start = text.indexOf("url(");
			var end = text.lastIndexOf(")");
			return text.substring(start + 4, end);
		});

		var hasGlobal = Array.some(sheet.cssRules, function(rule) {
			return rule.type == Components.interfaces.nsIDOMCSSRule.STYLE_RULE;
		});

		var appPattern = /^(chrome|about|x-jsd)/;
		var genericPattern = /^[^:]+:?\/*$/; //something like "http:"
		var that = this;
		var urlLikeRules = this.urlRules.concat(this.urlPrefixRules);

		// app styles have the xul namespace or urls with a specific protocol
		if (namespaces.indexOf("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul") != -1 || urlLikeRules.some(function(url) { return appPattern.test(url); }))
			this.addMeta("type", "app");
		// global styles have something outside of a moz-doc or a generic moz-doc and have either no namespace or include the html namespace
		else if (
			(hasGlobal && (namespaces.length == 0 || namespaces.indexOf(this.HTMLNS) != -1))
			|| urlLikeRules.some(function(url) { return genericPattern.test(url) })
			|| this.regexpRules.some(function(r) { return (new RegExp(r)).test("http://www.somesiteimadeup.com/");})
		)
			this.addMeta("type", "global");
		// everything else is site
		else 
			this.addMeta("type", "site");
	},

	get dataUrl() {
		if (!this.code)
			return null;
		var nameComment = this.name ? "/*" + this.name.replace(/\*\//g, "").replace(/#/g, "") + "*/" : "";
		// this will strip new lines rather than escape - not what we want
		//return this.ios.newURI("data:text/css," + nameComment + this.code.replace(/\n/g, "%0A"), null, null);
		return this.ios.newURI("data:text/css," + nameComment + encodeURIComponent(this.code), null, null);
	},

	register: function() {
		if (!this.stylishOn) {
			return;
		}
		var dataUrl = this.dataUrl;
		if (!dataUrl)
			return;
		var registrationMethod = this.calculateRegistrationMethod();
		// Save what we applied so we know what to remove later
		this.appliedInfo = [dataUrl, registrationMethod];
		this.sss.loadAndRegisterSheet(dataUrl, registrationMethod);
	},

	unregister: function() {
		var unregisterUrl;
		var unregisterMethod;
		if (this.shouldUnregisterOnLoad()) {
			unregisterUrl = this.dataUrl;
			unregisterMethod = this.calculateRegistrationMethod();
		} else if (this.appliedInfo == null) {
			// not registered in the first place
			return;
		} else {
			unregisterUrl = this.appliedInfo[0];
			unregisterMethod = this.appliedInfo[1];
		}
		
		if (this.sss.sheetRegistered(unregisterUrl, unregisterMethod))
			this.sss.unregisterSheet(unregisterUrl, unregisterMethod);
		// ignore unregistered styles if stylish isn't on
		else if (this.stylishOn)
			Components.utils.reportError("Stylesheet is supposed to be unregistered, but it's not registered in the first place.");
		this.appliedInfo = null;
	},

	bind: function(statement, name, value) {
		var index;
		try {
			index = statement.getParameterIndex(":" + name);
		} catch (ex) {
			if (ex.name == "NS_ERROR_ILLEGAL_VALUE") {
				index = statement.getParameterIndex(name);
			} else {
				throw ex;
			}
		}
		if (value === undefined)
			throw "Attempted to bind undefined parameter '" + name + "'";
		else if (value === null)
			statement.bindNullParameter(index);
		else {
			switch(typeof value) {
				case "string":
					statement.bindStringParameter(index, value);
					break;
				case "number":
					statement.bindInt32Parameter(index, value);
					break;
				case "boolean":
					statement.bindInt32Parameter(index, value ? 1 : 0);
					break;
				default:
					throw "Unknown value type '" + typeof value + "' for value '" + value + "'";
			}
		}
	},

	extract: function(statement, name) {
		var index = statement.getColumnIndex(name);
		var type = statement.getTypeOfIndex(index);
		switch (type) {
			case statement.VALUE_TYPE_NULL:
				return null;
			case statement.VALUE_TYPE_INTEGER:
				return statement.getInt32(index);
			case statement.VALUE_TYPE_FLOAT:
				return statement.getDouble(index);
			case statement.VALUE_TYPE_TEXT:
				return statement.getString(index);
			case statement.VALUE_TYPE_BLOB:
				return statement.getBlob(index);
			default:
				throw "Unrecognized column type " + type;
		}
	},

	get appliedInfo() {
		if (this.appliedInfoToBeCalculated) {
			this.appliedInfo = [this.dataUrl, this.calculateRegistrationMethod()];
			this.appliedInfoToBeCalculated = false;
		}
		return this._appliedInfo;
	},

	set appliedInfo(info) {
		this._appliedInfo = info;
	},

	findSql: function(sql, parameters, mode, connection) {
		var closeConnection = false;
		if (!connection) {
			connection = this.getConnection();
			closeConnection = true;
		}
		var statement = connection.createStatement(sql);
		for (i in parameters) {
			this.bind(statement, i, parameters[i]);
		}
		try {
			var that = this;
			function e(name) {
				return that.extract(statement, name);
			};
			var styles = [];
			var styleMap = [];
			while (statement.executeStep()) {
				var style = Components.classes["@userstyles.org/style;1"].createInstance(Components.interfaces.stylishStyle);
				//it makes no sense to calculate meta here because we can load from the db
				if (mode & this.CALCULATE_META)
					style.mode = mode - this.CALCULATE_META;
				else
					style.mode = mode;
				// since we can't call initInternal because we're not "inside" the new style, we'll pass a secret flag in the mode
				style.mode += this.INTERNAL_LOAD_EVENT
				style.init(e("url"), e("idUrl"), e("updateUrl"), e("md5Url"), e("name"), e("code"), e("enabled"), e("originalCode"), e("originalMd5"), e("applyBackgroundUpdates"));
				style.id = e("id");
				styles.push(style);
				styleMap[style.id] = style;
			}
		} finally {
			statement.reset();
			statement.finalize();
		}

		var styleIds = styles.map(function(style) {
			return style.id;
		});

		// fill up the meta
		var statement = connection.createStatement("SELECT * FROM style_meta WHERE style_id IN (" + styleIds.join(",") + ");");
		try {
			while (statement.executeStep()) {
				styleMap[this.extract(statement, "style_id")].addMeta(this.extract(statement, "name"), this.extract(statement, "value"));
			}
		} finally {
			statement.reset();
			statement.finalize();
		}

		//if we turned off CALCULATE_META, turn it back on
		styles.forEach(function(style) {
			if (style.mode != mode)
				style.mode = mode;
		});

		if (closeConnection) {
			connection.close();
		}

		return styles;
	},

	shouldCalculateMeta: function() {
		return this.mode & this.CALCULATE_META;
	},

	shouldRegisterOnChange: function() {
		return this.mode & this.REGISTER_STYLE_ON_CHANGE;
	},

	shouldRegisterOnLoad: function() {
		return this.mode & this.REGISTER_STYLE_ON_LOAD;
	},

	shouldUnregisterOnLoad: function() {
		return this.mode & this.UNREGISTER_STYLE_ON_LOAD;
	},

	setCode: function(code, shouldRegister) {
		//reference appliedInfo to make sure it has been calculated before we change the code
		this.appliedInfo;
		//save the last saved code in case we have to revert
		if (!this.lastSavedCode && this.code && this.id)
			this.lastSavedCode = this.code;
		this._code = code;
		if ((this.enabled || this.previewOn) && shouldRegister) {
			this.unregister();
			this.register();
		}
		this.calculateInternalMeta();
	},

	initInternal: function(url, idUrl, updateUrl, md5Url, name, code, enabled, originalCode, originalMd5, shouldRegister, applyBackgroundUpdates) {
		this.url = url;
		this.idUrl = idUrl;
		this.updateUrl = updateUrl;
		this.md5Url = md5Url;
		this.name = name;
		this._enabled = enabled;
		this.originalCode = originalCode;
		this.originalMd5 = originalMd5;
		this.setCode(code, shouldRegister);
		if (!shouldRegister && this.enabled) {
			this.appliedInfoToBeCalculated = true;
		}
		if (this.shouldUnregisterOnLoad()) {
			this.unregister();
		};
		// this is a string so that we can pass in null - null becomes 1 (AddonManager.AUTOUPDATE_DEFAULT)
		var abu = 1;
		if (applyBackgroundUpdates != null) {
			try {
			 abu = parseInt(applyBackgroundUpdates);
			} catch (ex) {}
		}
		this.applyBackgroundUpdates = abu;
	},

	get urlRules() {
		return this.getMeta("url", {});
	},

	get urlPrefixRules() {
		return this.getMeta("url-prefix", {});
	},

	get domainRules() {
		return this.getMeta("domain", {});
	},

	get regexpRules() {
		return this.getMeta("regexp", {});
	},

	get types() {
		return this.getMeta("type", {});
	},

	download: function(url, successCallback, failureCallback) {
		var request = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"].createInstance();
		var me = this;
		// QI the object to nsIDOMEventTarget to set event handlers on it:
		request.QueryInterface(Components.interfaces.nsIDOMEventTarget);
		request.addEventListener("readystatechange", function(event) {
			if (request.readyState == 4) {
				if ((request.status == 200 || (request.status == 0 && (url.indexOf("data:") == 0 || url.indexOf("file:") == 0))) && request.responseText) {
					var contentType;
					if (url.indexOf("file:") == 0) {
						// assume a local file is CSS
						contentType = "text/css";
					} else {
						contentType = request.getResponseHeader("Content-type");
						// get rid of charset
						if (contentType != null && contentType.indexOf(";") > -1) {
							contentType = contentType.split(";")[0];
						}
					}
					successCallback(request.responseText, contentType);
				} else {
					Components.utils.reportError("Download of '" + url + "' resulted in status " + request.status);
					if (failureCallback) {
						failureCallback();
					}
				}
			}
		}, false);
		// QI it to nsIXMLHttpRequest to open and send the request:
		request.QueryInterface(Components.interfaces.nsIXMLHttpRequest);
		request.overrideMimeType("text/plain");
		request.open("GET", url, true);
		request.send(null);
	},

	get stylishOn() {
		return Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch).getBoolPref("extensions.stylish.styleRegistrationEnabled");
	},

	getConnection: function() {
		return this.ds.getConnection();
	},

	unescapeCss: function(s) {
		return s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
	},

	unescapeRegexLiterals: function(s) {
		return s.replace(/\\/g, "");
	},

	calculateRegistrationMethod: function() {
		// Default to AUTHOR_SHEET if available, AGENT_SHEET if not or specifically chosen with a comment like /* AGENT_SHEET */
		if (!("AUTHOR_SHEET" in this.sss) || /\/\*\s*AGENT_SHEET\s*\*\//.test(this.code)) {
			return this.sss.AGENT_SHEET;
		}
		return this.sss.AUTHOR_SHEET;
	},

	downloadMd5: function(md5Url, callback) {
		if (!md5Url) {
			callback(null);
			return;
		}
		this.download(md5Url,
			function(text, contentType) {
				if (text.length == 32) {
					callback(text);
				} else {
					Components.utils.reportError("Invalid md5 at URL '" + md5Url + "'.");
					callback(null)
				}
			}, null
		);
	}

};

if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([Style]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([Style]);

