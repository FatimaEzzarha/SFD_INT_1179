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
                utilisateur: "",
                debutTraitement: new Date(),
                finTraitement: null
            });

            if (sap.ushell && sap.ushell.Container) {
                const sUserId = sap.ushell.Container.getUser().getId();
                oModel.setProperty("/utilisateur", sUserId);
            }

            oModel.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
            this.getView().setModel(oModel);
        },

        onValueHelpPointVente: function () {
            const oView = this.getView();
            const oModel = this.getOwnerComponent().getModel(); // OData model déjà configuré
        
            // Crée le SelectDialog uniquement une fois
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
                            this.mettreAJourValidation();
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
        
                this._oPointVenteDialog.setModel(oModel); // Bind le modèle OData
            }
        
            this._oPointVenteDialog.open();
        },

        onValueHelpCodeTransac: function (oEvent) {
            const oView = this.getView();
            const oModel = oView.getModel(); // JSONModel
            const oODataModel = this.getOwnerComponent().getModel(); // ODataModel
        
            const oInput = oEvent.getSource();
            const sPath = oInput.getBindingContext().getPath(); // ex: "/lignes/1"
        
            // 🔥 Sauvegarde des contextes actifs
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
        
                            // Met à jour uniquement l'input concerné
                            this._oInputActif.setValue(sCode);
        
                            // Appel GET_ENTITY pour récupérer tous les champs
                            oODataModel.read(`/FitypeCodeVHSet('${sCode}')`, {
                                success: (oData) => {
                                    const oLine = oModel.getProperty(this._sPathLigneActive);
                                    oLine.codeTransac = oData.FITYPECODE;
                                    oLine.libelleTransac = oData.FITYTDESCRIPTION;
                                    oLine.signe = oData.DEBITFLAG === "X" ? "-" : "+";
        
                                    oModel.setProperty(this._sPathLigneActive, oLine);
                                    this._sPathLigneActive = null;
                                    this._oInputActif = null;
                                    this.mettreAJourValidation();
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
        
                this._oVHCodeTransac.setModel(oODataModel); // Bind ODataModel
            }
        
            this._oVHCodeTransac.open();
        },
        
        
        onAjouterLigne: function () {
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
            this.mettreAJourValidation();
        },

        onSelectionChange: function (oEvent) {
            const aSelectedContexts = oEvent.getSource().getSelectedContexts();
            const aIndices = aSelectedContexts.map(ctx => parseInt(ctx.getPath().split("/")[2]));
            this.getView().getModel().setProperty("/selectedIndices", aIndices);
        },

        onSupprimerLigne: function () {
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
            this.calculerSolde();
            this.mettreAJourValidation();
        },

        onMontantChange: function () {
            this.calculerSolde();
            this.mettreAJourValidation();
        },


        calculerSolde: function () {
            const oModel = this.getView().getModel();
            const aLignes = oModel.getProperty("/lignes");
        
            const total = aLignes.reduce((acc, l) => {
                const montant = parseFloat(l.montant) || 0;
                const signe = l.signe === "-" ? -1 : 1;
                return acc + signe * montant;
            }, 0);
        
            oModel.setProperty("/solde", total.toFixed(2));
        },
        

        onChampChange: function () {
            this.mettreAJourValidation();
        },


        validerChampsRequis: function (isFromSubmit = false) {
            const oView = this.getView();
            const oModel = oView.getModel();
            let isValid = true;
        
            // === Champs entête ===
            const champsForm = [
                "inputPointVente", "inputDateVente", "inputTypeTransaction",
                "inputNumCaisse", "inputDevise", "inputUtilisateur", "inputRefTicket", "inputDebut"
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
        
        
            // Numéro de caisse : compris entre 0 et 999
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
        
            // === Vérification des lignes ===
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
        
            // === Vérification du solde ===
            const solde = parseFloat(oModel.getProperty("/solde"));
            if (isNaN(solde) || solde !== 0) {
                if (isFromSubmit) {
                    MessageToast.show("Le solde des montants doit être égal à 0.");
                }
                isValid = false;
            }
        
            return isValid;
        },
        
        
        

        mettreAJourValidation: function () {
            const isValid = this.validerChampsRequis(false); // 👉 on précise bien false ici
            this.getView().getModel().setProperty("/isFormValid", isValid);
        },
        

        onValider: function () {
            const oModel = this.getView().getModel();
            const that = this;
        
            MessageBox.confirm("Souhaitez-vous valider et envoyer cette transaction à CAR ?", {
                title: "Confirmation de validation",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        if (that.validerChampsRequis(true)) { // ✅ validation stricte à la soumission
                            oModel.setProperty("/finTraitement", new Date());
                            that.genererTransactionSequenceNumber();
                            oModel.setProperty("/isExportEnabled", true);
                            MessageToast.show("Transaction envoyée à CAR avec succès.");
                        }
                    }
                }
            });
        },

        genererTransactionSequenceNumber: function () {
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

            
            // 👉 Met à jour directement le champ input
            oView.byId("inputNumTransaction").setValue(sequence);
        
            return sequence;
        },
        
        

        onNouveau: function () {
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

                        ["inputPointVente", "inputDateVente", "inputNumCaisse", "inputRefTicket" , "inputNumTransaction"].forEach(id => {
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

        onQuitter: function () {
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

        onExporter: function () {
            const that = this;
            MessageBox.confirm("Souhaitez-vous exporter les données au format Excel ?", {
                title: "Confirmation d’export",
                onClose: function (oAction) {
                    if (oAction === MessageBox.Action.OK) {
                        that._exporterExcel();
                    }
                }
            });
        },

        _exporterExcel: function () {
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
                utilisateur: oData.utilisateur,
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
                { label: "Utilisateur", property: "utilisateur" },
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
