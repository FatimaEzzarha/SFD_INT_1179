/* global QUnit */
QUnit.config.autostart = false;

sap.ui.getCore().attachInit(function () {
	"use strict";

	sap.ui.require([
		"sfdintcr1179/test/unit/AllTests"
	], function () {
		QUnit.start();
	});
});
