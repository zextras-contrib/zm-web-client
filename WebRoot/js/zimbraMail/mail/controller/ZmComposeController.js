/*
 * ***** BEGIN LICENSE BLOCK *****
 * Version: ZPL 1.2
 *
 * The contents of this file are subject to the Zimbra Public License
 * Version 1.2 ("License"); you may not use this file except in
 * compliance with the License. You may obtain a copy of the License at
 * http://www.zimbra.com/license
 *
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See
 * the License for the specific language governing rights and limitations
 * under the License.
 *
 * The Original Code is: Zimbra Collaboration Suite Web Client
 *
 * The Initial Developer of the Original Code is Zimbra, Inc.
 * Portions created by Zimbra are Copyright (C) 2005, 2006 Zimbra, Inc.
 * All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK *****
 */

/**
* Creates a new compose controller to manage message composition.
* @constructor
* @class
* This class manages message composition.
*
* @author Conrad Damon
* @param appCtxt		the application context
* @param container		the containing element
* @param mailApp		a handle to the mail application
*/
function ZmComposeController(appCtxt, container, mailApp) {

	ZmController.call(this, appCtxt, container, mailApp);

	this._action = null;
	
	this._listeners = {};
	this._listeners[ZmOperation.SEND] = new AjxListener(this, this._sendListener);
	this._listeners[ZmOperation.CANCEL] = new AjxListener(this, this._cancelListener);
	this._listeners[ZmOperation.ATTACHMENT] = new AjxListener(this, this._attachmentListener);
	this._listeners[ZmOperation.DETACH_COMPOSE] = new AjxListener(this, this._detachListener);
	this._listeners[ZmOperation.SAVE_DRAFT] = new AjxListener(this, this._saveDraftListener);
	this._listeners[ZmOperation.ADD_SIGNATURE] = new AjxListener(this, this._addSignatureListener);
	this._listeners[ZmOperation.SPELL_CHECK] = new AjxListener(this, this._spellCheckListener);
	this._listeners[ZmOperation.COMPOSE_OPTIONS] = new AjxListener(this, this._optionsListener);
	
	var settings = this._appCtxt.getSettings();
	var scl = this._settingsChangeListener = new AjxListener(this, this._settingsChangeListener);
	for (var i = 0; i < ZmComposeController.SETTINGS.length; i++) {
		settings.getSetting(ZmComposeController.SETTINGS[i]).addChangeListener(scl);
	}
};

// settings whose changes affect us (so we add a listener to them)
ZmComposeController.SETTINGS = [ZmSetting.SHOW_CC, ZmSetting.SHOW_BCC,
								ZmSetting.SIGNATURE_ENABLED, ZmSetting.SIGNATURE];

// radio groups for options items
ZmComposeController.RADIO_GROUP = {};
ZmComposeController.RADIO_GROUP[ZmOperation.REPLY]			= 1;
ZmComposeController.RADIO_GROUP[ZmOperation.REPLY_ALL]		= 1;
ZmComposeController.RADIO_GROUP[ZmOperation.FORMAT_HTML]	= 2;
ZmComposeController.RADIO_GROUP[ZmOperation.FORMAT_TEXT]	= 2;
ZmComposeController.RADIO_GROUP[ZmOperation.INC_ATTACHMENT]	= 3;
ZmComposeController.RADIO_GROUP[ZmOperation.INC_NO_PREFIX]	= 3;
ZmComposeController.RADIO_GROUP[ZmOperation.INC_NONE]		= 3;
ZmComposeController.RADIO_GROUP[ZmOperation.INC_PREFIX]		= 3;
ZmComposeController.RADIO_GROUP[ZmOperation.INC_SMART]		= 3;

// translate between include preferences and operations
ZmComposeController.INC_OP = {};
ZmComposeController.INC_OP[ZmSetting.INCLUDE_ATTACH]	= ZmOperation.INC_ATTACHMENT;
ZmComposeController.INC_OP[ZmSetting.INCLUDE]			= ZmOperation.INC_NO_PREFIX;
ZmComposeController.INC_OP[ZmSetting.INCLUDE_NONE]		= ZmOperation.INC_NONE;
ZmComposeController.INC_OP[ZmSetting.INCLUDE_PREFIX]	= ZmOperation.INC_PREFIX;
ZmComposeController.INC_OP[ZmSetting.INCLUDE_SMART]		= ZmOperation.INC_SMART;
ZmComposeController.INC_MAP = {};
for (var i in ZmComposeController.INC_OP)
	ZmComposeController.INC_MAP[ZmComposeController.INC_OP[i]] = i;
delete i;

ZmComposeController.OPTIONS_TT = {};
ZmComposeController.OPTIONS_TT[ZmOperation.NEW_MESSAGE]		= "composeOptions";
ZmComposeController.OPTIONS_TT[ZmOperation.REPLY]			= "replyOptions";
ZmComposeController.OPTIONS_TT[ZmOperation.REPLY_ALL]		= "replyOptions";
ZmComposeController.OPTIONS_TT[ZmOperation.FORWARD_ATT]		= "forwardOptions";
ZmComposeController.OPTIONS_TT[ZmOperation.FORWARD_INLINE]	= "forwardOptions";

ZmComposeController.prototype = new ZmController();
ZmComposeController.prototype.constructor = ZmComposeController;

ZmComposeController.prototype.toString =
function() {
	return "ZmComposeController";
};

// Public methods

/**
* Called by ZmNewWindow.unload to remove ZmSettings listeners (which reside in 
* the parent window). Otherwise, after the child window is closed, the parent 
* window is still referencing the child window's compose controller, which has
* been unloaded!!
*/
ZmComposeController.prototype.dispose = 
function() {
	var settings = this._appCtxt.getSettings();
	for (var i = 0; i < ZmComposeController.SETTINGS.length; i++) {
		settings.getSetting(ZmComposeController.SETTINGS[i]).removeChangeListener(this._settingsChangeListener);
	}
};

ZmComposeController.prototype.doAction =
function(action, inNewWindow, msg, toOverride, subjOverride, extraBodyText) {
	if (inNewWindow) {
		var newWinObj = this._appCtxt.getNewWindow();

		// this is how child window knows what to do once loading:
		newWinObj.command = "compose";
		newWinObj.args = [action, msg, toOverride, subjOverride, extraBodyText, null];
	} else {
		this._setView(action, msg, toOverride, subjOverride, extraBodyText, null);
	}
};

ZmComposeController.prototype.toggleSpellCheckButton = 
function(toggled) {
	var spellCheckButton = this._toolbar.getButton(ZmOperation.SPELL_CHECK);
	spellCheckButton.setToggled((toggled || false));
};

/**
* Detaches compose view to child window
*
* @param msg	the original message
*/
ZmComposeController.prototype.detach =
function() {
	// bug fix #7192 - disable detach toolbar button
	this._toolbar.enable(ZmOperation.DETACH_COMPOSE, false);

	var msg = this._composeView.getOrigMsg();
	var addrs = this._composeView.getRawAddrFields();
	var subj = this._composeView._subjectField.value;
	var forAttHtml = this._composeView.getForwardLinkHtml();
	var body = this._composeView.getHtmlEditor().getContent();
	var composeMode = this._composeView.getComposeMode();

	var newWinObj = this._appCtxt.getNewWindow();

	// this is how child window knows what to do once loading:
	newWinObj.command = "composeDetach";

	newWinObj.args = {action: this._action, msg: msg, addrs: addrs, subj: subj, forwardHtml: forAttHtml, body: body, composeMode: composeMode };
};

ZmComposeController.prototype.popShield =
function() {
	if (!this._composeView.isDirty()) {
		return true;
	}

	var ps = this._popShield = this._appCtxt.getYesNoCancelMsgDialog();
	if (this._appCtxt.get(ZmSetting.SAVE_DRAFT_ENABLED)) {
		ps.reset();
		ps.setMessage(ZmMsg.askSaveDraft, DwtMessageDialog.WARNING_STYLE);
		ps.registerCallback(DwtDialog.YES_BUTTON, this._popShieldYesCallback, this);
		ps.registerCallback(DwtDialog.NO_BUTTON, this._popShieldNoCallback, this);
		ps.registerCallback(DwtDialog.CANCEL_BUTTON, this._popShieldDismissCallback, this);
	} else {
		ps.setMessage(ZmMsg.askLeaveCompose, DwtMessageDialog.WARNING_STYLE);
		ps.registerCallback(DwtDialog.YES_BUTTON, this._popShieldYesCallback, this);
		ps.registerCallback(DwtDialog.NO_BUTTON, this._popShieldNoCallback, this);
	}
	ps.popup(this._composeView._getDialogXY());

	return false;
};

ZmComposeController.prototype._preHideCallback =
function() {
	return this.popShield();
};

ZmComposeController.prototype._postShowCallback = 
function() {
	ZmController.prototype._postShowCallback.call(this);
	this._composeView.setFocus();
};

/**
* Sends the message represented by the content of the compose view.
*/
ZmComposeController.prototype.sendMsg =
function(attId, isDraft, callback) {
	var msg = this._composeView.getMsg(attId, isDraft);
	if (!msg) return;
	
	if (msg.inviteMode == ZmOperation.REPLY_CANCEL) {
		var origMsg = msg._origMsg;
		var appt = origMsg._appt;
		var respCallback = new AjxCallback(this, this._handleResponseCancelAppt);
		appt.cancel(origMsg._mode, msg, respCallback);
		return;
	}

	var contactList = !isDraft
		? this._appCtxt.getApp(ZmZimbraMail.CONTACTS_APP).getContactList() : null;

	var respCallback = new AjxCallback(this, this._handleResponseSendMsg, [isDraft, msg, callback]);
	var errorCallback = new AjxCallback(this, this._handleErrorSendMsg);
	var resp = msg.send(contactList, isDraft, respCallback, errorCallback);

	// XXX: temp bug fix #4325 - if resp returned, we're processing sync request
	//      REVERT this bug fix once mozilla fixes bug #295422!
	if (resp) {
		this._processSendMsg(isDraft, msg, resp);
	}
};

ZmComposeController.prototype._handleResponseSendMsg =
function(isDraft, msg, callback, result) {
	var resp = result.getResponse();
	this._processSendMsg(isDraft, msg, resp);

	if (callback) callback.run(result);
};

ZmComposeController.prototype._handleResponseCancelAppt =
function() {
	this._composeView.reset(false);
	this._app.popView(true);
};

ZmComposeController.prototype._handleErrorSendMsg =
function(ex) {
	this._toolbar.enableAll(true);
	var msg = null;
	if (ex.code == ZmCsfeException.MAIL_SEND_ABORTED_ADDRESS_FAILURE) {
		var invalid = ex.getData(ZmCsfeException.MAIL_SEND_ADDRESS_FAILURE_INVALID);
		var invalidMsg = (invalid && invalid.length) ? AjxMessageFormat.format(ZmMsg.sendErrorInvalidAddresses,
														AjxStringUtil.htmlEncode(invalid.join(", "))) : null;
		msg = ZmMsg.sendErrorAbort + "<br/>" + invalidMsg;
	} else if (ex.code == ZmCsfeException.MAIL_SEND_PARTIAL_ADDRESS_FAILURE) {
		var invalid = ex.getData(ZmCsfeException.MAIL_SEND_ADDRESS_FAILURE_INVALID);
		msg = (invalid && invalid.length) ? AjxMessageFormat.format(ZmMsg.sendErrorPartial,
											AjxStringUtil.htmlEncode(invalid.join(", "))) : ZmMsg.sendErrorAbort;
	}
	if (msg) {
		this._msgDialog.setMessage(msg, DwtMessageDialog.CRITICAL_STYLE);
		this._msgDialog.popup();
		return true;
	} else {
		return false;
	}
};

/**
* Creates a new ZmComposeView if one does not already exist
*
* @param initHide	Set to true if compose view should be initially rendered 
*					off screen (used as an optimization to preload this view)
*/
ZmComposeController.prototype.initComposeView = 
function(initHide, composeMode) {
	if (this._composeView) return;

	this._composeView = new ZmComposeView(this._container, this, composeMode);
	var callbacks = {};
	callbacks[ZmAppViewMgr.CB_PRE_HIDE] = new AjxCallback(this, this._preHideCallback);
	callbacks[ZmAppViewMgr.CB_POST_SHOW] = new AjxCallback(this, this._postShowCallback);
	var elements = {};
	this._initializeToolBar();
	elements[ZmAppViewMgr.C_TOOLBAR_TOP] = this._toolbar;
	elements[ZmAppViewMgr.C_APP_CONTENT] = this._composeView;
    this._app.createView(ZmController.COMPOSE_VIEW, elements, callbacks, null, true);
    if (initHide) {
	    this._composeView.setLocation(Dwt.LOC_NOWHERE, Dwt.LOC_NOWHERE);
	    this._composeView.enableInputs(false);
	}
};

/**
 * Sets the tab stops for the compose form based on what's showing. Called any
 * time an address field is hidden/shown, as well as when the view is set.
 * 
 * @param field		[DwtControl|input]*		element to set focus to
 */
ZmComposeController.prototype._setComposeTabGroup =
function(field) {

	this._saveFocus();

	var tg = this._createTabGroup();
	var rootTg = this._appCtxt.getRootTabGroup();
	tg.newParent(rootTg);
	tg.addMember(this._toolbar);
	var addrFields = this._composeView.getAddrFields();
	for (var i = 0; i < addrFields.length; i++) {
		tg.addMember(addrFields[i]);
	}
	tg.addMember(this._composeView._subjectField);
	tg.addMember(this._composeView._bodyField);
	
	this._restoreFocus();

	if (field) {
		this._shell.getKeyboardMgr().grabFocus(field);
	}
};

ZmComposeController.prototype.getKeyMapName =
function() {
	return "ZmComposeController";
};

ZmComposeController.prototype.handleKeyAction =
function(actionCode) {
	DBG.println("ZmComposeController.handleKeyAction");
	switch (actionCode) {
		case ZmKeyMap.CANCEL:
			this._cancelCompose();
			break;
			
		case ZmKeyMap.SAVE: // Save to draft
			if (this._appCtxt.get(ZmSetting.SAVE_DRAFT_ENABLED)) {
				this._saveDraft();
			}
			break;

		case ZmKeyMap.SEND: // Send message
			this._send();
			break;

		case ZmKeyMap.ATTACHMENT:
			this._attachmentListener();
			break;

		case ZmKeyMap.SPELLCHECK:
			this.toggleSpellCheckButton(true);
			this._spellCheckListener();
			break;
		
		case ZmKeyMap.HTML_FORMAT:
			if (this._appCtxt.get(ZmSetting.HTML_COMPOSE_ENABLED)) {
				var mode = this._composeView.getComposeMode();
				var newMode = (mode == DwtHtmlEditor.TEXT) ? DwtHtmlEditor.HTML : DwtHtmlEditor.TEXT;
				this._setFormat(newMode);
			}
			break;

		case ZmKeyMap.ADDRESS_PICKER:
			this._composeView._addressButtonListener(null, ZmEmailAddress.TO);
			break;

		case ZmKeyMap.NEW_WINDOW:
			if (!this.isChildWindow) {
				this._detachListener();
			}
			break;

		default:
			return ZmMailListController.prototype.handleKeyAction.call(this, actionCode);
			break;
	}
	return true;
};

// Private methods

ZmComposeController.prototype._deleteDraft =
function(delMsg) {

	var list = delMsg.list;
	var mailItem, request;

	if (list && list.type == ZmItem.CONV) {
		mailItem = list.getById(delMsg.getConvId());
		request = "ConvActionRequest";
	} else {
		mailItem = delMsg;
		request = "MsgActionRequest";
	}

	// manually delete "virtual conv" or msg created but never added to internal list model
	var soapDoc = AjxSoapDoc.create(request, "urn:zimbraMail");
	var actionNode = soapDoc.set("action");
	actionNode.setAttribute("id", mailItem.id);
	actionNode.setAttribute("op", "delete");

	var async = window.parentController == null;
	this._appCtxt.getAppController().sendRequest({soapDoc:soapDoc, asyncMode:async});
};

// Creates the compose view based on the mode we're in. Lazily creates the
// compose toolbar, a contact picker, and the compose view itself.
ZmComposeController.prototype._setView =
function(action, msg, toOverride, subjOverride, extraBodyText, composeMode) {

	// save args in case we need to re-display (eg go from Reply to Reply All)
	this._action = action;
	this._msg = msg;
	this._toOverride = toOverride;
	this._subjOverride = subjOverride;
	this._extraBodyText = extraBodyText;

	this._initializeToolBar();
	this._toolbar.enableAll(true);
	if (action == ZmOperation.REPLY_CANCEL) {
		this._toolbar.enable([ZmOperation.ATTACHMENT, ZmOperation.SAVE_DRAFT], false);
	}

	this.initComposeView(null, composeMode);

	this._composeMode = composeMode ? composeMode : this._setComposeMode(msg);
	this._setOptionsMenu(this._composeMode);

	this._composeView.set(action, msg, toOverride, subjOverride, extraBodyText);
	this._setComposeTabGroup();
	this._app.pushView(ZmController.COMPOSE_VIEW);
	this._composeView.reEnableDesignMode();
};

ZmComposeController.prototype._initializeToolBar =
function() {
	if (this._toolbar) return;
	
	var buttons = [ZmOperation.SEND, ZmOperation.CANCEL, ZmOperation.SEP];
	if (this._appCtxt.get(ZmSetting.SAVE_DRAFT_ENABLED))
		buttons.push(ZmOperation.SAVE_DRAFT);
	buttons.push(ZmOperation.ATTACHMENT, ZmOperation.SPELL_CHECK);
	buttons.push(ZmOperation.ADD_SIGNATURE);

	buttons.push(ZmOperation.FILLER); // right-align remaining buttons
	buttons.push(ZmOperation.COMPOSE_OPTIONS);
	if (!this.isChildWindow) {
		buttons.push(ZmOperation.DETACH_COMPOSE);
	}

	var className = this.isChildWindow ? "ZmAppToolBar_cw" : "ZmAppToolBar";
	this._toolbar = new ZmButtonToolBar(this._container, buttons, null, Dwt.ABSOLUTE_STYLE, className);

	for (var i = 0; i < buttons.length; i++)
		if (buttons[i] > 0 && this._listeners[buttons[i]])
			this._toolbar.addSelectionListener(buttons[i], this._listeners[buttons[i]]);

	var canAddSig = (!this._appCtxt.get(ZmSetting.SIGNATURE_ENABLED) && this._appCtxt.get(ZmSetting.SIGNATURE));
	var signatureButton = this._toolbar.getButton(ZmOperation.ADD_SIGNATURE);
	signatureButton.setVisible(canAddSig);

	var actions = [ZmOperation.NEW_MESSAGE, ZmOperation.REPLY, ZmOperation.FORWARD_ATT, ZmOperation.DRAFT];
	this._optionsMenu = {};
	for (var i = 0; i < actions.length; i++) {
		this._optionsMenu[actions[i]] = this._createOptionsMenu(actions[i]);
	}
	this._optionsMenu[ZmOperation.REPLY_ALL] = this._optionsMenu[ZmOperation.REPLY];
	this._optionsMenu[ZmOperation.FORWARD_INLINE] = this._optionsMenu[ZmOperation.FORWARD_ATT];
	this._optionsMenu[ZmOperation.SHARE] = this._optionsMenu[ZmOperation.NEW_MESSAGE];

	// change default button style to toggle for spell check button
	var spellCheckButton = this._toolbar.getButton(ZmOperation.SPELL_CHECK);
	spellCheckButton.setAlign(DwtLabel.IMAGE_LEFT | DwtButton.TOGGLE_STYLE);

	// reduce toolbar width if low-res display
	if (AjxEnv.is800x600orLower) {
		spellCheckButton.setText("");
		// if "add signature" button exists, remove label for attachment button
		if (canAddSig) {
			var attachmentButton = this._toolbar.getButton(ZmOperation.ATTACHMENT);
			attachmentButton.setText("");
		}
	}
};

ZmComposeController.prototype._createOptionsMenu =
function(action) {

	var isReply = (action == ZmOperation.REPLY || action == ZmOperation.REPLY_ALL);
	var isForward = (action == ZmOperation.FORWARD_ATT || action == ZmOperation.FORWARD_INLINE);
	var list = [];
	if (isReply)
		list.push(ZmOperation.REPLY, ZmOperation.REPLY_ALL, ZmOperation.SEP);
	if (this._appCtxt.get(ZmSetting.HTML_COMPOSE_ENABLED)) {
		list.push(ZmOperation.FORMAT_HTML, ZmOperation.FORMAT_TEXT, ZmOperation.SEP);
	}
	list.push(ZmOperation.SHOW_CC, ZmOperation.SHOW_BCC);
	if (isReply) {
		list.push(ZmOperation.SEP, ZmOperation.INC_NONE, ZmOperation.INC_ATTACHMENT, ZmOperation.INC_NO_PREFIX,
				  ZmOperation.INC_PREFIX, ZmOperation.INC_SMART);
	} else if (isForward) {
		list.push(ZmOperation.SEP, ZmOperation.INC_ATTACHMENT, ZmOperation.INC_NO_PREFIX, ZmOperation.INC_PREFIX);
	}

	var button = this._toolbar.getButton(ZmOperation.COMPOSE_OPTIONS);
	var menu = new ZmPopupMenu(button);
	
	for (var i = 0; i < list.length; i++) {
		var op = list[i];
		if (op == ZmOperation.SEP) {
			menu.createSeparator();
		} else {
			var style = (op == ZmOperation.SHOW_CC || op == ZmOperation.SHOW_BCC) ? DwtMenuItem.CHECK_STYLE : DwtMenuItem.RADIO_STYLE;
			var radioGroup = (style == DwtMenuItem.RADIO_STYLE) ? ZmComposeController.RADIO_GROUP[op] : null;
			var text = (op == ZmOperation.REPLY) ? ZmMsg.replySender : ZmMsg[ZmOperation.getProp(op, "textKey")];
			var mi = menu.createMenuItem(op, ZmOperation.getProp(op, "image"), text, null, true, style, radioGroup);
			if (op == ZmOperation.FORMAT_HTML) {
				mi.setData(ZmHtmlEditor._VALUE, DwtHtmlEditor.HTML);
			} else if (op == ZmOperation.FORMAT_TEXT) {
				mi.setData(ZmHtmlEditor._VALUE, DwtHtmlEditor.TEXT);
			}
			mi.setData(ZmOperation.KEY_ID, op);		
			mi.addSelectionListener(this._listeners[ZmOperation.COMPOSE_OPTIONS]);
		}
	}
	return menu;
};

ZmComposeController.prototype._setOptionsMenu =
function(composeMode) {
	var button = this._toolbar.getButton(ZmOperation.COMPOSE_OPTIONS);
	button.setToolTipContent(ZmMsg[ZmComposeController.OPTIONS_TT[this._action]]);
	var menu = this._optionsMenu[this._action];
	if (!menu) return;

	if (this._appCtxt.get(ZmSetting.HTML_COMPOSE_ENABLED)) {
		menu.checkItem(ZmHtmlEditor._VALUE, composeMode, true);
	}
	var isReply = (this._action == ZmOperation.REPLY || this._action == ZmOperation.REPLY_ALL);
	var isForward = (this._action == ZmOperation.FORWARD_ATT || this._action == ZmOperation.FORWARD_INLINE);
	if (isReply || isForward) {
		var includePref = this._appCtxt.get(isReply ? ZmSetting.REPLY_INCLUDE_ORIG : ZmSetting.FORWARD_INCLUDE_ORIG);
		this._curIncOption = ZmComposeController.INC_OP[includePref];
		menu.checkItem(ZmOperation.KEY_ID, this._curIncOption, true);
		if (isReply) {
			menu.checkItem(ZmOperation.KEY_ID, this._action, true);
		}
	}
	menu.getItemById(ZmOperation.KEY_ID, ZmOperation.SHOW_CC).setChecked(this._appCtxt.get(ZmSetting.SHOW_CC), true);
	menu.getItemById(ZmOperation.KEY_ID, ZmOperation.SHOW_BCC).setChecked(this._appCtxt.get(ZmSetting.SHOW_BCC), true);
	
	button.setMenu(menu);
};

ZmComposeController.prototype._setComposeMode =
function(msg) {
	// depending on COS/user preference set compose format
	var composeMode = DwtHtmlEditor.TEXT;

	if (this._appCtxt.get(ZmSetting.HTML_COMPOSE_ENABLED)) {
		var bComposeSameFormat = this._appCtxt.get(ZmSetting.COMPOSE_SAME_FORMAT);
		var bComposeAsFormat = this._appCtxt.get(ZmSetting.COMPOSE_AS_FORMAT);

		if (this._action == ZmOperation.REPLY ||
			this._action == ZmOperation.REPLY_ALL ||
			this._action == ZmOperation.FORWARD_INLINE)
		{
			if ((!bComposeSameFormat && bComposeAsFormat == ZmSetting.COMPOSE_HTML) ||
			    (bComposeSameFormat && msg.isHtmlMail()))
			{
				composeMode = DwtHtmlEditor.HTML;
			}
		}
		else if (this._action == ZmOperation.NEW_MESSAGE)
		{
			if (bComposeAsFormat == ZmSetting.COMPOSE_HTML)
				composeMode = DwtHtmlEditor.HTML;
		}
		else if (this._action == ZmOperation.DRAFT)
		{
			if (msg.isHtmlMail())
				composeMode = DwtHtmlEditor.HTML;
		}
	}

	this._composeView.setComposeMode(composeMode);

	return composeMode;
};

ZmComposeController.prototype._setFormat =
function(mode) {
	if (mode == this._composeView.getComposeMode())	return;

	if (mode == DwtHtmlEditor.TEXT &&
		(this._composeView.isDirty() || this._action == ZmOperation.DRAFT))
	{
		// if formatting from html to text, confirm w/ user!
		if (!this._htmlToTextDialog) {
			this._htmlToTextDialog = new DwtMessageDialog(this._shell, null, [DwtDialog.OK_BUTTON, DwtDialog.CANCEL_BUTTON]);
			this._htmlToTextDialog.setMessage(ZmMsg.switchToText, DwtMessageDialog.WARNING_STYLE);
			this._htmlToTextDialog.registerCallback(DwtDialog.OK_BUTTON, this._htmlToTextOkCallback, this);
			this._htmlToTextDialog.registerCallback(DwtDialog.CANCEL_BUTTON, this._htmlToTextCancelCallback, this);
		}
		this._htmlToTextDialog.popup(this._composeView._getDialogXY());
	}
	else
	{
		this._composeView.setComposeMode(mode);
	}
};

ZmComposeController.prototype._processSendMsg = 
function(isDraft, msg, resp) {
	if (!isDraft) {
		if (this.isChildWindow && window.parentController) {
			window.onbeforeunload = null;
			window.parentController.setStatusMsg(ZmMsg.messageSent);
		} else {
			this._appCtxt.setStatusMsg(ZmMsg.messageSent);
		}

		if (resp || !this._appCtxt.get(ZmSetting.SAVE_TO_SENT)) {
			this._composeView.reset(false);

			// if the original message was a draft, we need to nuke it
			var origMsg = msg._origMsg;
			if (origMsg && origMsg.isDraft)
				this._deleteDraft(origMsg);

			this._app.popView(true);
		}
	} else {
		// TODO - disable save draft button indicating a draft was saved
		//        ** new UI will show in toaster section
		if (this.isChildWindow && window.parentController) {
			window.parentController.setStatusMsg(ZmMsg.draftSaved);
		} else {
			this._appCtxt.setStatusMsg(ZmMsg.draftSaved);
		}
		this._composeView.reEnableDesignMode();
		// save message draft so it can be reused if user saves draft again
		this._composeView.processMsgDraft(msg);
	}
};


// Listeners

// Send button was pressed
ZmComposeController.prototype._sendListener =
function(ev) {
	this._send();
};

ZmComposeController.prototype._send =
function() {
	this._toolbar.enableAll(false); // thwart multiple clicks on Send button
	this.sendMsg();
};

// Cancel button was pressed
ZmComposeController.prototype._cancelListener =
function(ev) {
	this._cancelCompose();
};

ZmComposeController.prototype._cancelCompose =
function() {
	var dirty = this._composeView.isDirty();
	if (!dirty) {
		this._composeView.reset(true);
	} else {
		this._composeView.enableInputs(false);
	}
	this._composeView.reEnableDesignMode();
	this._app.popView(!dirty);
}

// Attachment button was pressed
ZmComposeController.prototype._attachmentListener =
function(ev) {

	if (!this._detachOkCancel) {
		// detach ok/cancel dialog is only necessary if user clicked on the add attachments button
		this._detachOkCancel = new DwtMessageDialog(this._shell, null, [DwtDialog.OK_BUTTON, DwtDialog.CANCEL_BUTTON]);
		this._detachOkCancel.setMessage(ZmMsg.detachAnyway, DwtMessageDialog.WARNING_STYLE);
		this._detachOkCancel.registerCallback(DwtDialog.OK_BUTTON, this._detachCallback, this);
	}

	this._composeView.addAttachmentField();
};

ZmComposeController.prototype._optionsListener =
function(ev) {
	var op = ev.item.getData(ZmOperation.KEY_ID);

	// Show CC/BCC are checkboxes
	if (op == ZmOperation.SHOW_CC || op == ZmOperation.SHOW_BCC) {
		var showField = (ev.detail == DwtMenuItem.CHECKED);
		var addrType = (op == ZmOperation.SHOW_CC) ? ZmEmailAddress.CC : ZmEmailAddress.BCC;
		this._composeView._showAddressField(addrType, showField);
		return;
	}

	// Click on "Options" button.
	if (op == ZmOperation.COMPOSE_OPTIONS && this._optionsMenu[this._action]) {
		var button = this._toolbar.getButton(ZmOperation.COMPOSE_OPTIONS);
		var bounds = button.getBounds();
		this._optionsMenu[this._action].popup(0, bounds.x, bounds.y + bounds.height, false);
		return;	
	}
	
	// the rest are radio buttons, we only care when they're selected
	if (ev.detail != DwtMenuItem.CHECKED) return;

	if (op == ZmOperation.REPLY || op == ZmOperation.REPLY_ALL) {
		this._composeView._setAddresses(op, this._toOverride);
	} else if (op == ZmOperation.FORMAT_HTML || op == ZmOperation.FORMAT_TEXT) {
		this._setFormat(ev.item.getData(ZmHtmlEditor._VALUE));
	} else {
		var incOption = ZmComposeController.INC_MAP[op];
		if (incOption) {
			if (this._composeView.isDirty()) {
				if (!this._switchIncludeDialog) {
					this._switchIncludeDialog = new DwtMessageDialog(this._shell, null, [DwtDialog.OK_BUTTON, DwtDialog.CANCEL_BUTTON]);
					this._switchIncludeDialog.setMessage(ZmMsg.switchIncludeWarning, DwtMessageDialog.WARNING_STYLE);
					this._switchIncludeDialog.registerCallback(DwtDialog.CANCEL_BUTTON, this._switchIncludeCancelCallback, this);
				}
				this._switchIncludeDialog.registerCallback(DwtDialog.OK_BUTTON, this._switchIncludeOkCallback, this, incOption);
				this._switchIncludeDialog.popup(this._composeView._getDialogXY());
			} else {
				this._composeView.resetBody(this._action, this._msg, this._extraBodyText, incOption);
				this._curIncOption = ZmComposeController.INC_OP[incOption];
			}
		}
	}
};

ZmComposeController.prototype._detachListener =
function(ev) {
	var atts = this._composeView.getAttFieldValues();
	if (atts.length) {
		this._detachOkCancel.popup(this._composeView._getDialogXY());
	} else {
		this.detach();
	}
};

// Save Draft button was pressed
ZmComposeController.prototype._saveDraftListener =
function(ev) {
	this._saveDraft();
};

ZmComposeController.prototype._saveDraft =
function() {
	var respCallback = new AjxCallback(this, this._handleResponseSaveDraftListener);
	this.sendMsg(null, true, respCallback);
};

ZmComposeController.prototype._handleResponseSaveDraftListener =
function(args) {
	this._action = ZmOperation.DRAFT;
};

ZmComposeController.prototype._addSignatureListener =
function(ev) {
	this._composeView.addSignature();
};

ZmComposeController.prototype._spellCheckListener = 
function(ev) {
	var spellCheckButton = this._toolbar.getButton(ZmOperation.SPELL_CHECK);
	var htmlEditor = this._composeView.getHtmlEditor();

	if (spellCheckButton.isToggled()) {
		var callback = new AjxCallback(this, this.toggleSpellCheckButton)
		if (!htmlEditor.spellCheck(callback))
			this.toggleSpellCheckButton(false);
	} else {
		htmlEditor.discardMisspelledWords();
	}
};

ZmComposeController.prototype._settingsChangeListener =
function(ev) {
	if (ev.type != ZmEvent.S_SETTING) return;

	var id = ev.source.id;
	if (id == ZmSetting.SIGNATURE_ENABLED || id == ZmSetting.SIGNATURE) {
		var canAddSig = (!this._appCtxt.get(ZmSetting.SIGNATURE_ENABLED) && this._appCtxt.get(ZmSetting.SIGNATURE));
		var signatureButton = this._toolbar.getButton(ZmOperation.ADD_SIGNATURE);
		signatureButton.setVisible(canAddSig);
	} else if (id == ZmSetting.SHOW_CC) {
		var menu = this._optionsMenu[this._action];
		if (menu)
			menu.getItemById(ZmOperation.KEY_ID, ZmOperation.SHOW_CC).setChecked(this._appCtxt.get(ZmSetting.SHOW_CC), true);
	} else if (id == ZmSetting.SHOW_BCC) {
		var menu = this._optionsMenu[this._action];
		if (menu)
			menu.getItemById(ZmOperation.KEY_ID, ZmOperation.SHOW_BCC).setChecked(this._appCtxt.get(ZmSetting.SHOW_BCC), true);
	}
};


// Callbacks

ZmComposeController.prototype._detachCallback =
function() {
	// get rid of any lingering attachments since they cannot be detached
	this._composeView.cleanupAttachments();
	this._detachOkCancel.popdown();
	this.detach();
};

ZmComposeController.prototype._htmlToTextOkCallback =
function() {
	this._htmlToTextDialog.popdown();
	this._composeView.setComposeMode(DwtHtmlEditor.TEXT);
};

ZmComposeController.prototype._htmlToTextCancelCallback =
function() {
	this._htmlToTextDialog.popdown();

	// reset the radio button for the format button menu
	var menu = this._toolbar.getButton(ZmOperation.COMPOSE_OPTIONS).getMenu();
	menu.checkItem(ZmHtmlEditor._VALUE, DwtHtmlEditor.HTML, true);

	this._composeView.reEnableDesignMode();
};

// Called as: Yes, save as draft
//			  Yes, go ahead and cancel
ZmComposeController.prototype._popShieldYesCallback =
function() {
	this._popShield.popdown();
	this._composeView.enableInputs(true);
	if (this._appCtxt.get(ZmSetting.SAVE_DRAFT_ENABLED)) {
		// save as draft
		this.sendMsg(null, true);
	} else {
		// cancel
		this._composeView.reset(false);
	}
	this._app.getAppViewMgr().showPendingView(true);
};

// Called as: No, don't save as draft
//			  No, don't cancel
ZmComposeController.prototype._popShieldNoCallback =
function() {
	this._popShield.popdown();
	this._composeView.enableInputs(true);
	if (this._appCtxt.get(ZmSetting.SAVE_DRAFT_ENABLED)) {
		this._composeView.reset(false);

		// bug fix #5282
		// check if the pending view is poppable - if so, force-pop this view first!
		var avm = this._app.getAppViewMgr();
		if (avm.isPoppable(avm.getPendingViewId()))
			this._app.popView(true);

		this._app.getAppViewMgr().showPendingView(true);
	} else {
		this._app.getAppViewMgr().showPendingView(false);
		this._composeView.reEnableDesignMode();
	}
};

// Called as: Don't save as draft or cancel
ZmComposeController.prototype._popShieldDismissCallback =
function() {
	this._popShield.popdown();
	this._composeView.enableInputs(true);
	this._app.getAppViewMgr().showPendingView(false);
	this._composeView.reEnableDesignMode();
};

ZmComposeController.prototype._switchIncludeOkCallback =
function(incOption) {
	this._switchIncludeDialog.popdown();
	this._composeView.resetBody(this._action, this._msg, this._extraBodyText, incOption);
	this._curIncOption = ZmComposeController.INC_OP[incOption];
};

ZmComposeController.prototype._switchIncludeCancelCallback =
function() {
	this._switchIncludeDialog.popdown();
	// reset the radio button for the include mode
	var menu = this._optionsMenu[this._action];
	if (!menu) return;
	menu.checkItem(ZmOperation.KEY_ID, this._curIncOption, true);
};
