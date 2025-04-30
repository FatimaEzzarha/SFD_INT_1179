sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/ui/export/Spreadsheet"
], function (BaseController, JSONModel, MessageToast, MessageBox, Spreadsheet) {
    "use strict";

    return BaseController.extend("sfdintcr1179.controller.MainView", {
        onInit: function () {
            const oModel = new JSONModel({
                lignes: [],
                solde: "0.00",
                selectedIndices: [],
                isFormValid: false,
                isExportEnabled: false,
                user: "",
                debutTraitement: new Date(),
                finTraitement: null
            });



            // if (sap.ushell && sap.ushell.Container) {
            //     const sUserId = sap.ushell.Container.getUser().getId();
            //     oModel.setProperty("/user", sUserId);
            // }

            sap.ui.require(["sap/ushell/Container"], function () {
                sap.ushell.Container
                    .getServiceAsync("UserInfo")
                    .then(function (oUserInfo) {
                        // ► API ≥ UI5 1.75 :
                        oModel.setProperty("/user", oUserInfo.getId())
                        // ► Par sécurité pour les versions plus anciennes :
                        // console.log("User ID :", oUserInfo.getUser().getId());
                    })
                    .catch(function (err) {
                        //console.error("UserInfo service KO :", err);
                    });
            });




            oModel.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
            this.getView().setModel(oModel);
        },

        // ******************************************************* Value Help *************************************************************************************

        onValueHelpRetailStore: function () {
            const oView = this.getView();
            const oModel = this.getOwnerComponent().getModel(); 

            // SelectDialog 
            if (!this._oPointVenteDialog) {
                this._oPointVenteDialog = new sap.m.SelectDialog({
                    title: "Sélectionner un point de vente",
                    items: {
                        path: "/RetailStoreVHSet",
                        template: new sap.m.StandardListItem({
                            title: "{RETAILSTOREID}"
                        })
                    },
                    confirm: (oEvent) => {
                        const oSelected = oEvent.getParameter("selectedItem");
                        if (oSelected) {
                            const sSelected = oSelected.getTitle();
                            oView.byId("inputPointVente").setValue(sSelected);
                            this.updateValidationState();
                        }
                    },
                    search: function (oEvent) {
                        debugger;
                        const sValue = oEvent.getParameter("value");
                        const oFilter = new sap.ui.model.Filter("RETAILSTOREID", sap.ui.model.FilterOperator.Contains, sValue);
                        oEvent.getSource().getBinding("items").filter([oFilter]);
                    },
                    liveChange: function (oEvent) {
                        const sValue = oEvent.getParameter("value");
                        const oFilter = new sap.ui.model.Filter("RETAILSTOREID", sap.ui.model.FilterOperator.Contains, sValue);
                        oEvent.getSource().getBinding("items").filter([oFilter]);
                    }

                });

                this._oPointVenteDialog.setModel(oModel); 
            }

            this._oPointVenteDialog.open();
        },

        onValueHelpTransactionCode: function (oEvent) {
            const oView = this.getView();
            const oModel = oView.getModel(); 
            const oODataModel = this.getOwnerComponent().getModel();

            const oInput = oEvent.getSource();
            const sPath = oInput.getBindingContext().getPath(); 

            this._sPathLigneActive = sPath;
            this._oInputActif = oInput;

            if (!this._oVHCodeTransac) {
                this._oVHCodeTransac = new sap.m.SelectDialog({
                    title: "Sélectionner un code transaction",
                    items: {
                        path: "/FitypeCodeVHSet",
                        template: new sap.m.StandardListItem({
                            title: "{FITYPECODE}",
                            description: "{FITYTDESCRIPTION}"
                        })
                    },
                    confirm: (oEvt) => {
                        const oSelected = oEvt.getParameter("selectedItem");
                        if (oSelected && this._sPathLigneActive && this._oInputActif) {
                            const sCode = oSelected.getTitle();
                            this._oInputActif.setValue(sCode);
                            oODataModel.read(`/FitypeCodeVHSet('${sCode}')`, {
                                success: (oData) => {
                                    const oLine = oModel.getProperty(this._sPathLigneActive);
                                    oLine.codeTransac = oData.FITYPECODE;
                                    oLine.libelleTransac = oData.FITYTDESCRIPTION;
                                    oLine.signe = oData.DEBITFLAG === "X" ? "-" : "+";

                                    oModel.setProperty(this._sPathLigneActive, oLine);
                                    this._sPathLigneActive = null;
                                    this._oInputActif = null;
                                    this.updateValidationState();
                                },
                                error: () => {
                                    MessageToast.show("Erreur lors de la récupération du code transaction.");
                                }
                            });
                        }
                    },
                    search: function (oEvent) {

                        const sValue = oEvent.getParameter("value");
                        const oFilter = new sap.ui.model.Filter("FITYTDESCRIPTION", sap.ui.model.FilterOperator.Contains, sValue);
                        oEvent.getSource().getBinding("items").filter([oFilter]);
                    },
                    liveChange: function (oEvent) {
                        const sValue = oEvent.getParameter("value");
                        const oFilter = new sap.ui.model.Filter("FITYTDESCRIPTION", sap.ui.model.FilterOperator.Contains, sValue);
                        oEvent.getSource().getBinding("items").filter([oFilter]);
                    }
                });

                this._oVHCodeTransac.setModel(oODataModel); 
            }

            this._oVHCodeTransac.open();
        },


        // ************************************************************ Table des données  poste ********************************************************************

        onAddLine: function () {
            const oModel = this.getView().getModel();
            const aLignes = oModel.getProperty("/lignes");
            aLignes.push({
                posteId: aLignes.length + 1,
                codeTransac: "",
                libelleTransac: "",
                signe: "",
                montant: "",
                codeTransacState: "None",
                codeTransacStateText: "",
                montantState: "None",
                montantStateText: ""
            });

            oModel.setProperty("/lignes", aLignes);
            this.updateValidationState();
        },

        onSelectionChange: function (oEvent) {
            const aSelectedContexts = oEvent.getSource().getSelectedContexts();
            const aIndices = aSelectedContexts.map(ctx => parseInt(ctx.getPath().split("/")[2]));
            this.getView().getModel().setProperty("/selectedIndices", aIndices);
        },

        onRemoveSelectedLines: function () {
            const oModel = this.getView().getModel();
            let aLignes = oModel.getProperty("/lignes");
            const aSelectedIndices = oModel.getProperty("/selectedIndices") || [];

            if (!aSelectedIndices.length) {
                MessageToast.show("Veuillez sélectionner au moins une ligne à supprimer.");
                return;
            }

            aSelectedIndices.sort((a, b) => b - a).forEach(i => aLignes.splice(i, 1));
            aLignes = aLignes.map((ligne, index) => ({ ...ligne, posteId: index + 1 }));

            oModel.setProperty("/lignes", aLignes);
            oModel.setProperty("/selectedIndices", []);
            this.calculateBalance();
            this.updateValidationState();
        },

        // *****************************************************     Balance          **********************************************************************************************

        onAmountChanged: function () {
            this.calculateBalance();
            this.updateValidationState();
        },


        calculateBalance: function () {
            const oModel = this.getView().getModel();
            const aLignes = oModel.getProperty("/lignes");

            const total = aLignes.reduce((acc, l) => {
                const montant = parseFloat(l.montant) || 0;
                const signe = l.signe === "-" ? -1 : 1;
                return acc + signe * montant;
            }, 0);

            oModel.setProperty("/solde", total.toFixed(2));
        },


        //*****************************************************    Submit Button     ******************************************************************************************** 

        onFieldChange: function () {
            this.updateValidationState();
        },

        validateRequiredFields: function (isFromSubmit = false) {
            const oView = this.getView();
            const oModel = oView.getModel();
            let isValid = true;
            const champsForm = [
                "inputPointVente", "inputDateVente", "inputTypeTransaction",
                "inputNumCaisse", "inputDevise", "inputUser", "inputRefTicket", "inputDebut"
            ];

            champsForm.forEach(id => {
                const oField = oView.byId(id);
                const value = oField.getValue?.() || oField.getDateValue?.();
                if (!value) {
                    oField.setValueState("Error");
                    oField.setValueStateText("Ce champ est obligatoire.");
                    isValid = false;
                } else {
                    oField.setValueState("None");
                }
            });


            // NumCaisse : between 1 and 999
            const numCaisse = oView.byId("inputNumCaisse");
            const caisseValue = numCaisse.getValue().trim();
            const regex = /^\d+$/;

            const intValue = parseInt(caisseValue, 10);

            if (!regex.test(caisseValue) || intValue < 1 || intValue > 999) {
                numCaisse.setValueState("Error");
                numCaisse.setValueStateText("Le numéro de caisse doit être un entier entre 1 et 999.");
                isValid = false;
            } else {
                numCaisse.setValueState("None");
            }

            // Réf. ticket : max 20
            const refTicket = oView.byId("inputRefTicket");
            const refValue = refTicket.getValue();
            if (refValue.length > 20) {
                refTicket.setValueState("Error");
                refTicket.setValueStateText("La référence ticket ne doit pas dépasser 20 caractères.");
                isValid = false;
            }

            // === Line item validation ===
            const aLignes = oModel.getProperty("/lignes") || [];

            if (aLignes.length === 0) {
                if (isFromSubmit) {
                    MessageToast.show("Veuillez ajouter au moins une ligne de transaction.");
                }
                isValid = false;
            } else {
                aLignes.forEach((l, idx) => {

                    // Montant : décimal avec 2 décimales max
                    if (!/^\d{1,15}(\.\d{1,2})?$/.test(l.montant)) {
                        l.montantState = "Error";
                        l.montantStateText = "Le montant doit être un nombre avec jusqu'à 2 décimales.";
                        isValid = false;
                    } else {
                        l.montantState = "None";
                        l.montantStateText = "";
                    }
                });
                oModel.setProperty("/lignes", aLignes); // mise à jour
            }

            // === Balance validation ===
            const solde = parseFloat(oModel.getProperty("/solde"));
            if (isNaN(solde) || solde !== 0) {
                if (isFromSubmit) {
                    MessageToast.show("Le solde des montants doit être égal à 0.");
                }
                isValid = false;
            }

            return isValid;
        },




        updateValidationState: function () {
            const isValid = this.validateRequiredFields(false); 
            this.getView().getModel().setProperty("/isFormValid", isValid);
        },


        onSubmit: function () {
            const oModel = this.getView().getModel();
            const that = this;

            MessageBox.confirm("Souhaitez-vous valider et envoyer cette transaction à CAR ?", {
                title: "Confirmation de validation",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        if (that.validateRequiredFields(true)) { 
                            oModel.setProperty("/finTraitement", new Date());
                            that.generateTransactionNumber();
                            that.onSendToBackend();
                            
                        }
                    }
                }
            });
        },

        onSendToBackend: function () {
            debugger;
            const oView = this.getView();
            const oModel = oView.getModel();
            const oODataModel = this.getOwnerComponent().getModel();

            // Champs header
            const retailstoreid = oView.byId("inputPointVente").getValue();
            const oDate = oView.byId("inputDateVente").getDateValue();
            const businessdaydate = oDate
                ? `${oDate.getFullYear()}${(oDate.getMonth() + 1).toString().padStart(2, '0')}${oDate.getDate().toString().padStart(2, '0')}`
                : "";
            const transnumber = oView.byId("inputNumTransaction").getValue();
            const transtypecode = oView.byId("inputTypeTransaction").getValue();
            const workstationid = oView.byId("inputNumCaisse").getValue();
            const transcurrency = oView.byId("inputDevise").getValue();
            const processuser = oView.byId("inputUser").getValue();
            const oDebut = oModel.getProperty("/debutTraitement");
            const begintimestamp = oDebut
                ? `${oDebut.getFullYear()}${(oDebut.getMonth() + 1).toString().padStart(2, '0')}${oDebut.getDate().toString().padStart(2, '0')}${oDebut.getHours().toString().padStart(2, '0')}${oDebut.getMinutes().toString().padStart(2, '0')}${oDebut.getSeconds().toString().padStart(2, '0')}`
                : "";

            const oFin = oModel.getProperty("/finTraitement");
            const endtimestamp = oFin
                ? `${oFin.getFullYear()}${(oFin.getMonth() + 1).toString().padStart(2, '0')}${oFin.getDate().toString().padStart(2, '0')}${oFin.getHours().toString().padStart(2, '0')}${oFin.getMinutes().toString().padStart(2, '0')}${oFin.getSeconds().toString().padStart(2, '0')}`
                : "";



            const origtransnumber = oView.byId("inputRefTicket").getValue();
            const lignes = oModel.getProperty("/lignes") || [];

            const hdrtoitemnav = lignes.map((ligne) => ({
                RETAILSTOREID: retailstoreid,
                POSTEID: ligne.posteId,
                FINANCIALTYPECODE: ligne.codeTransac,
                SIGN: ligne.signe,
                AMOUNT: ligne.montant
            }));

            const payload = {
                RETAILSTOREID: retailstoreid,
                BUSINESSDAYDATE: businessdaydate,
                TRANSNUMBER: transnumber,
                TRANSTYPECODE: transtypecode,
                WORKSTATIONID: workstationid,
                TRANSCURRENCY: transcurrency,
                PROCESSUSER: processuser,
                BEGINTIMESTAMP: begintimestamp,
                ENDTIMESTAMP: endtimestamp,
                ORIGTRANSNUMBER: origtransnumber,
                HDRTOITEMNAV: hdrtoitemnav,
                ToMessages: []
            };

            oODataModel.create("/IdocHeaderSet", payload, {
                success: function (oData) {
                    if (oData && oData.ToMessages && oData.ToMessages.results) {
                        var aMessages = oData.ToMessages.results;
                        var errorMessage = "";
                        var successMessage = "";
                        var hasError = false;
            
                        aMessages.forEach(function (oMessage) {
                            if (oMessage.type === 'E') {
                                errorMessage += oMessage.message + "\n";
                                hasError = true;
                            } else {
                                successMessage += oMessage.message ;
                            }
                        });
            
                        if (hasError) {
                            MessageBox.error(errorMessage || "Erreur inconnue lors de l'envoi.");
                        } else {
                            MessageBox.success(successMessage );
                            oModel.setProperty("/isFormValid", false);
                            oModel.setProperty("/isExportEnabled", true);

                        }
                    } else {
                        MessageToast.show("Formulaire envoyé, mais aucun message de retour.");
                    }
                },
                error: function () {
                    MessageBox.error("Erreur lors de l’envoi du formulaire.");
                }
            });
            

            console.log(payload);
        },

        generateTransactionNumber: function () {
            const oView = this.getView();
            const oModel = oView.getModel();

            const pointVente = oView.byId("inputPointVente").getValue();
            const caisse = oView.byId("inputNumCaisse").getValue();
            const fin = oModel.getProperty("/finTraitement");

            if (!pointVente || !caisse || !fin) {
                return;
            }

            const last4Store = pointVente.slice(-4);
            const workstation = String(caisse).padStart(3, '0');
            const year = fin.getFullYear().toString().slice(-2);
            const startOfYear = new Date(fin.getFullYear(), 0, 0);
            const diff = fin - startOfYear;
            const oneDay = 1000 * 60 * 60 * 24;
            const dayOfYear = Math.floor(diff / oneDay).toString().padStart(3, '0');


            const pad = (n) => (n < 10 ? '0' + n : n);
            const hh = pad(fin.getHours());
            const mm = pad(fin.getMinutes());
            const ss = pad(fin.getSeconds());
            const time = `${hh}${mm}${ss}`;

            const sequence = `${last4Store}${workstation}${year}${dayOfYear}${time}`;
            oView.byId("inputNumTransaction").setValue(sequence);

            return sequence;
        },

 
    //  ********************************************       Reset Button        **********************************************************************  
        onResetForm: function () {
            const that = this;

            MessageBox.confirm("Souhaitez-vous réinitialiser le formulaire ?", {
                title: "Confirmation de réinitialisation",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        const oModel = that.getView().getModel();
                        oModel.setProperty("/lignes", []);
                        oModel.setProperty("/solde", "0.00");
                        oModel.setProperty("/selectedIndices", []);
                        oModel.setProperty("/finTraitement", null);
                        oModel.setProperty("/debutTraitement", new Date());
                        oModel.setProperty("/isFormValid", false);
                        oModel.setProperty("/isExportEnabled", false);

                        ["inputPointVente", "inputDateVente", "inputNumCaisse", "inputRefTicket", "inputNumTransaction"].forEach(id => {
                            const oField = that.getView().byId(id);
                            if (oField?.setValue) {
                                oField.setValue("");
                                oField.setValueState("None");
                            }
                        });

                        MessageToast.show("Formulaire réinitialisé.");
                    }
                }
            });
        },

        
    //  ********************************************       Exit Button        **********************************************************************  
    onExit: function () {
            MessageBox.confirm("Souhaitez-vous quitter le formulaire ?", {
                title: "Confirmation de sortie",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        sap.ushell.Container.getService("CrossApplicationNavigation")
                            .toExternal({ target: { shellHash: "#" } });
                    }
                }
            });
        },

        
    //  ********************************************      Export Button        **********************************************************************  

         onExportToExcel: function () {
            const that = this;
            MessageBox.confirm("Souhaitez-vous exporter les données au format Excel ?", {
                title: "Confirmation d’export",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        that._buildExcelFile();
                    }
                }
            });
        },

        _buildExcelFile: function () {
            const oView = this.getView();
            const oModel = oView.getModel();
            const oData = oModel.getData();

            const dateVente = oView.byId("inputDateVente").getDateValue();
            const numCaisse = oView.byId("inputNumCaisse").getValue();
            const numTransaction = oView.byId("inputNumTransaction").getValue();
            const pointVente = oView.byId("inputPointVente").getValue();

            const dd = String(dateVente.getDate()).padStart(2, '0');
            const mm = String(dateVente.getMonth() + 1).padStart(2, '0');
            const yyyy = dateVente.getFullYear();
            const dateFormatted = `${dd}${mm}${yyyy}`;

            const fileName = `Reclassement_${numCaisse}_${numTransaction}_SGM_${pointVente}_${dateFormatted}.xlsx`;

            const formatDateTime = function (oDate) {
                if (!oDate) return "";
                const pad = (n) => (n < 10 ? '0' + n : n);
                return `${pad(oDate.getDate())}/${pad(oDate.getMonth() + 1)}/${oDate.getFullYear()} ${pad(oDate.getHours())}:${pad(oDate.getMinutes())}:${pad(oDate.getSeconds())}`;
            };

            const aRows = oData.lignes.map((ligne) => ({
                pointVente: pointVente,
                numCaisse: numCaisse,
                refTicket: oView.byId("inputRefTicket").getValue(),
                dateVente: `${dd}/${mm}/${yyyy}`,
                numTransaction: numTransaction,
                posteId: ligne.posteId,
                codeTransac: ligne.codeTransac,
                libelleTransac: ligne.libelleTransac,
                montant: (ligne.signe === "-" ? "-" : "") + (parseFloat(ligne.montant).toFixed(2) || "0.00"),
                user: oData.user,
                debutTraitement: formatDateTime(oData.debutTraitement),
                finTraitement: formatDateTime(oData.finTraitement)
            }));

            const aCols = [
                { label: "Point de vente", property: "pointVente" },
                { label: "Numéro de caisse", property: "numCaisse" },
                { label: "Réf. Ticket Initial", property: "refTicket" },
                { label: "Date de vente", property: "dateVente" },
                { label: "Numéro de transaction", property: "numTransaction" },
                { label: "n° de Poste", property: "posteId" },
                { label: "Code Transaction Financière", property: "codeTransac" },
                { label: "Libellé Transaction financière", property: "libelleTransac" },
                { label: "Montants", property: "montant" },
                { label: "user", property: "user" },
                { label: "Début du traitement", property: "debutTraitement" },
                { label: "Fin du traitement", property: "finTraitement" }
            ];

            const oSpreadsheet = new Spreadsheet({
                workbook: { columns: aCols },
                dataSource: aRows,
                fileName: fileName,
                worker: false
            });

            oSpreadsheet.build().finally(() => oSpreadsheet.destroy());
        }
    });
});
