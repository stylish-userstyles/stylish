Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

function StylishDataSource() {}
StylishDataSource.prototype = {

	/*
		nsISupports
	*/
	QueryInterface: XPCOMUtils.generateQI([Components.interfaces.stylishDataSource, Components.interfaces.nsIClassInfo, Components.interfaces.nsISupports]),


	/*
		nsIClassInfo
	*/
	getInterfaces: function getInterfaces(aCount) {
		var interfaces = [Components.interfaces.stylishDataSource, Components.interfaces.nsIClassInfo, Components.interfaces.nsISupports];
		aCount.value = interfaces.length;
		return interfaces;
	},
	getHelperForLanguage: function getHelperForLanguage(aLanguage) {
		return null;
	},
	classDescription: "Stylish Data Source",
	classID: Components.ID("{d6fe57ea-1126-4dc6-8636-d25d5b901929}"),
	contractID: "@userstyles.org/stylish-data-source;1",
	implementationLanguage: Components.interfaces.nsIProgrammingLanguage.JAVASCRIPT,
	flags: 0,
	alreadyComplained: false,


	/*
		stylishDataSource
	*/
	getConnection: function() {
		var storageService = Components.classes["@mozilla.org/storage/service;1"].getService(Components.interfaces.mozIStorageService);
		try {
			//xxx what about uris?
			var connection = storageService.openDatabase(this.getFile());
		} catch (ex) {
			if (!this.alreadyComplained) {
				this.alreadyComplained = true;
				var promptService = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService)
				promptService.alert(null, 'Problem with Stylish', 'Stylish is having problems opening its database. It will be non-functional until this problem is fixed. See http://userstyles.org/help/db for help.');
			}
			throw ex;
		}
		this.migrate(connection);
		return connection;
	},

	getFile: function() {
		if (!this._file) {
			var path = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch).getCharPref("extensions.stylish.dbFile");
			if (path) {
				this._file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
				this._file.initWithPath(path);
			} else {
				this._file = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties).get("ProfD", Components.interfaces.nsIFile);
				this._file.append("stylish.sqlite");
			}
		}
		return this._file;
	},

	/*
		private
	*/
	_file: null,

	migrate: function(connection) {
		var expectedDataVersion = 5;
		var currentDataVersion = connection.schemaVersion;
		if (currentDataVersion >= expectedDataVersion)
			return;
		connection.beginTransaction();
		switch (currentDataVersion) {
			case 0:
				connection.executeSimpleSQL("DROP TABLE IF EXISTS styles; CREATE TABLE styles (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, url TEXT, updateUrl TEXT, md5Url TEXT, name TEXT NOT NULL, code TEXT NOT NULL, enabled INTEGER NOT NULL);");
				connection.executeSimpleSQL("DROP TABLE IF EXISTS style_meta; CREATE TABLE style_meta (id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, style_id INTEGER NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL);");
				connection.executeSimpleSQL("DROP INDEX IF EXISTS style_meta_style_id; CREATE INDEX style_meta_style_id ON style_meta (style_id);");
			case 1:
				try {
					connection.executeSimpleSQL("ALTER TABLE styles ADD COLUMN originalCode TEXT NULL;");
				} catch (ex) {
					// this can happen if the user downgrades to a version with schema 1 then upgrades. they will then already have the column.
				}
			case 2:
				try {
					connection.executeSimpleSQL("ALTER TABLE styles ADD COLUMN idUrl TEXT NULL; UPDATE styles SET idUrl = url;");
				} catch (ex) {}
			case 3:
					connection.executeSimpleSQL("UPDATE styles SET md5Url = REPLACE(md5Url, 'http://userstyles.org/styles/', 'http://update.userstyles.org/') WHERE md5Url LIKE 'http://userstyles.org/styles/%.md5';");
			case 4:
				try {
					connection.executeSimpleSQL("ALTER TABLE styles ADD COLUMN applyBackgroundUpdates INTEGER NOT NULL DEFAULT 1;"); // 1 = AddonManager.AUTOUPDATE_DEFAULT
				} catch (ex) {}
		}
		connection.schemaVersion = expectedDataVersion;
		connection.commitTransaction();
	}

};

var components = [StylishDataSource];
if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule(components);

