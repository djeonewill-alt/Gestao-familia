        // ========== DADOS GLOBAIS ==========
        const CURRENT_SCHEMA_VERSION = 1;

        let data = {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            saldoAtual: 0,
            fundoEmergencia: 0,
            metaEconomia: 0,
            categorias: [
                'Salário',
                'Freela',
                'Dízimo',
                'Oferta',
                'Mercado - Proteínas',
                'Mercado - Hortifruti',
                'Mercado - Básicos',
                'Mercado - Limpeza',
                'Mercado - Supérfluos',
                'Transporte',
                'Moradia',
                'Saúde',
                'Lazer',
                'Educação',
                'Outros'
            ],
            responsaveis: ['Meu', 'Igreja', 'Outros'],
            accounts: [
                {
                    id: 'conta-principal',
                    nome: 'Conta Principal',
                    ativa: true
                }
            ],
            cartoes: [],
            cardItems: [],
            cardRecurringItems: [],
            cardInvoices: [],
            decisionScenarios: [],
            transacoes: [],
            listaMercado: [],
            historicoPrecos: {}
        };

        let currentWeekOffset = 0;

        // ========== INICIALIZAÇÃO ==========
        function init() {
            loadData();
            setDefaultDates();
            updateAllSelects();
            updateCardItemForm();
            gerarLancamentosFaturasAutomatico();
            updateSemanal();
            updateMercado();
            renderCategorias();
            renderResponsaveis();
            renderCartoes();
            renderCardRecurringItems();
            loadMetasReservas();
        }

        // Gerar lançamentos automáticos de faturas
        function gerarLancamentosFaturasAutomatico() {
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7);
    const proximoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1).toISOString().slice(0, 7);

    [mesAtual, proximoMes].forEach(mesRef => {
        data.cartoes.forEach(cartao => {
            ensureInvoicePaymentTransaction(cartao.id, mesRef, { silent: true });
        });
    });
}

        function setDefaultDates() {
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('dinheiroData').value = today;
            document.getElementById('cartaoData').value = today;
            document.getElementById('simData').value = today;
            const cardItemDate = document.getElementById('cardItemPurchaseDate');
            if (cardItemDate) cardItemDate.value = today;
            const cardItemFirstInvoiceMonth = document.getElementById('cardItemFirstInvoiceMonth');
            if (cardItemFirstInvoiceMonth) cardItemFirstInvoiceMonth.value = new Date().toISOString().slice(0, 7);
            
            const thisMonth = new Date().toISOString().slice(0, 7);
            document.getElementById('mesReferencia').value = thisMonth;
        }

        // ========== PERSISTÃŠNCIA ==========
        function getTodayDateString() {
            return new Date().toISOString().split('T')[0];
        }

        function normalizeTransaction(t) {
            const now = new Date().toISOString();
            const transaction = t && typeof t === 'object' ? { ...t } : {};

            if (!transaction.accountId) transaction.accountId = 'conta-principal';
            if (!transaction.createdAt) transaction.createdAt = now;
            if (!transaction.updatedAt) transaction.updatedAt = now;

            if (transaction.tipo === 'dinheiro') {
                if (!transaction.dataPrevista) transaction.dataPrevista = transaction.data || null;
                if (transaction.valorPrevisto === undefined || transaction.valorPrevisto === null) {
                    transaction.valorPrevisto = transaction.valor ?? null;
                }
                if (!transaction.origem) transaction.origem = 'manual';
                if (!transaction.status) {
                    transaction.status = transaction.realizado === true ? 'confirmado' : 'previsto';
                }
                if (transaction.observacao === undefined || transaction.observacao === null) {
                    transaction.observacao = '';
                }

                if (transaction.status === 'confirmado') {
                    if (!transaction.dataRealizada) {
                        transaction.dataRealizada = transaction.dataPrevista || transaction.data || null;
                    }
                    if (transaction.valorRealizado === undefined || transaction.valorRealizado === null) {
                        transaction.valorRealizado = transaction.valorPrevisto ?? transaction.valor ?? null;
                    }
                    if (!transaction.confirmedAt) transaction.confirmedAt = now;
                } else {
                    if (transaction.dataRealizada === undefined) transaction.dataRealizada = null;
                    if (transaction.valorRealizado === undefined) transaction.valorRealizado = null;
                    if (transaction.confirmedAt === undefined) transaction.confirmedAt = null;
                }

                return transaction;
            }

            if (transaction.tipo === 'cartao') {
                if (!transaction.origem) transaction.origem = 'cartao';
                return transaction;
            }

            if (!transaction.origem) transaction.origem = 'manual';
            return transaction;
        }

        function migrateDataToCurrentSchema(loadedData) {
            if (!loadedData || typeof loadedData !== 'object' || Array.isArray(loadedData)) {
                return data;
            }

            const migrated = { ...data, ...loadedData };

            migrated.schemaVersion = CURRENT_SCHEMA_VERSION;

            if (!Array.isArray(migrated.accounts) || migrated.accounts.length === 0) {
                migrated.accounts = [
                    {
                        id: 'conta-principal',
                        nome: 'Conta Principal',
                        ativa: true
                    }
                ];
            }

            if (!Array.isArray(migrated.categorias)) migrated.categorias = [];
            if (!Array.isArray(migrated.responsaveis)) migrated.responsaveis = [];
            if (!Array.isArray(migrated.cartoes)) migrated.cartoes = [];
            if (!Array.isArray(migrated.cardItems)) migrated.cardItems = [];
            if (!Array.isArray(migrated.cardRecurringItems)) migrated.cardRecurringItems = [];
            migrated.cardRecurringItems = migrated.cardRecurringItems.map(item => {
                const now = new Date().toISOString();
                const recurringItem = item && typeof item === 'object' ? item : {};
                return {
                    ...recurringItem,
                    status: recurringItem.status || 'active',
                    endInvoiceMonth: recurringItem.endInvoiceMonth || null,
                    createdAt: recurringItem.createdAt || now,
                    updatedAt: recurringItem.updatedAt || now
                };
            });
            if (!Array.isArray(migrated.cardInvoices)) migrated.cardInvoices = [];
            migrated.cardInvoices = migrated.cardInvoices.map(invoice => {
                const now = new Date().toISOString();
                const safeInvoice = invoice && typeof invoice === 'object' ? invoice : {};
                const monthRef = normalizeMonthRef(safeInvoice.monthRef) || normalizeMonthRef(String(safeInvoice.id || '').split('_').pop());
                const cardId = safeInvoice.cardId || String(safeInvoice.id || '').split('_')[0] || null;
                const status = ['aberta', 'fechada', 'paga'].includes(safeInvoice.status) ? safeInvoice.status : 'aberta';
                return {
                    ...safeInvoice,
                    id: safeInvoice.id || (cardId && monthRef ? getInvoiceKey(cardId, monthRef) : Date.now() + Math.random()),
                    cardId,
                    monthRef,
                    status,
                    paymentTransactionId: safeInvoice.paymentTransactionId || null,
                    paidAt: safeInvoice.paidAt || null,
                    createdAt: safeInvoice.createdAt || now,
                    updatedAt: safeInvoice.updatedAt || now
                };
            });
            if (!Array.isArray(migrated.transacoes)) migrated.transacoes = [];
            if (!Array.isArray(migrated.listaMercado)) migrated.listaMercado = [];
            if (!migrated.historicoPrecos || typeof migrated.historicoPrecos !== 'object' || Array.isArray(migrated.historicoPrecos)) {
                migrated.historicoPrecos = {};
            }

            migrated.transacoes = migrated.transacoes.map(normalizeTransaction);

            
    migrated.decisionScenarios = Array.isArray(migrated.decisionScenarios) ? migrated.decisionScenarios : [];
return migrated;
        }

        function saveData() {
            data = migrateDataToCurrentSchema(data);
            localStorage.setItem('financeDataV2', JSON.stringify(data));
        }

        function loadData() {
            const saved = localStorage.getItem('financeDataV2');
            if (!saved) return;

            try {
                const rawData = saved;
                const loaded = JSON.parse(rawData);
                if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
                    const needsMigration = !loaded.schemaVersion || loaded.schemaVersion < CURRENT_SCHEMA_VERSION;
                    if (needsMigration && !localStorage.getItem('financeDataV2_backup_pre_schema_1_done')) {
                        createManualBackup();
                        localStorage.setItem('financeDataV2_backup_pre_schema_1_done', new Date().toISOString());
                    }

                    data = migrateDataToCurrentSchema(loaded);
                    if (needsMigration) saveData();
                } else {
                    console.warn('Dados salvos em financeDataV2 não são um objeto válido. Usando dados padrão.');
                }
            } catch (err) {
                console.error('Erro ao carregar dados do localStorage. Usando dados padrão sem apagar financeDataV2.', err);
            }
        }

        function createManualBackup() {
            const saved = localStorage.getItem('financeDataV2');
            if (!saved) {
                console.log('Nenhum dado encontrado em financeDataV2 para backup.');
                return false;
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupKey = `financeDataV2_backup_${timestamp}`;
            localStorage.setItem(backupKey, saved);
            console.log(`Backup manual criado em ${backupKey}.`);
            return true;
        }

        function exportData() {
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `financas_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            alert('Dados exportados com sucesso!');
        }

        function importData() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json';
            input.onchange = e => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = event => {
                    try {
                        const parsed = JSON.parse(event.target.result);
                        const knownFields = [
                            'saldoAtual',
                            'categorias',
                            'responsaveis',
                            'cartoes',
                            'transacoes',
                            'listaMercado',
                            'historicoPrecos'
                        ];
                        const isValidAppData = parsed &&
                            typeof parsed === 'object' &&
                            !Array.isArray(parsed) &&
                            knownFields.some(field => Object.prototype.hasOwnProperty.call(parsed, field));

                        if (!isValidAppData) {
                            alert('Arquivo inválido para este aplicativo.');
                            return;
                        }

                        data = migrateDataToCurrentSchema(parsed);
                        saveData();
                        init();
                        alert('Dados importados com sucesso!');
                    } catch (err) {
                        console.error('Erro ao importar arquivo.', err);
                        alert('Erro ao importar arquivo!');
                    }
                };
                reader.readAsText(file);
            };
            input.click();
        }

        function resetData() {
            if (confirm('Tem certeza que deseja apagar TODOS os dados? Esta ação não pode ser desfeita!')) {
                if (confirm('ÚLTIMA CONFIRMAÇÃO: Todos os lançamentos, cartões e configurações serão perdidos!')) {
                    localStorage.removeItem('financeDataV2');
                    location.reload();
                }
            }
        }
        // ========== FORMATAÇÃO ==========
        function formatCurrency(value) {
            return new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
            }).format(value);
        }

        function formatDate(dateStr) {
            const date = new Date(dateStr + 'T12:00:00');
            return date.toLocaleDateString('pt-BR');
        }

        function getDerivedStatus(t) {
            if (t.status === 'confirmado') return 'confirmado';
            if (t.status === 'cancelado') return 'cancelado';
            if (t.status === 'atrasado') return 'atrasado';

            const dataPrevista = t.dataPrevista || t.data;
            const isPrevisto = t.status === 'previsto' || !t.status;

            if (!t.status && t.realizado === true) return 'confirmado';

            if (isPrevisto && dataPrevista) {
                const hoje = new Date(getTodayDateString() + 'T12:00:00');
                const dataT = new Date(dataPrevista + 'T12:00:00');
                if (dataT < hoje) return 'atrasado';
            }

            return 'previsto';
        }

        function getStatusBadgeHtml(t) {
            const status = getDerivedStatus(t);

            if (status === 'confirmado') {
                return '<span class="badge status-realizado">Confirmado</span>';
            }
            if (status === 'atrasado') {
                return '<span class="badge status-planejado" style="background: #f39c12; color: white;">Atrasado</span>';
            }
            if (status === 'cancelado') {
                return '<span class="badge status-planejado">Cancelado</span>';
            }

            return '<span class="badge status-planejado">Previsto</span>';
        }

        function getTransactionPlannedDate(t) {
            return t.dataPrevista || t.data || null;
        }

        function getTransactionActualDate(t) {
            return t.dataRealizada || null;
        }

        function getTransactionPlannedValue(t) {
            const value = t.valorPrevisto ?? t.valor ?? 0;
            return Number(value) || 0;
        }

        function getTransactionActualValue(t) {
            const value = t.valorRealizado ?? t.valorPrevisto ?? t.valor ?? 0;
            return Number(value) || 0;
        }

        function isTransactionConfirmed(t) {
            return getDerivedStatus(t) === 'confirmado';
        }

        function isTransactionPendingLike(t) {
            const status = getDerivedStatus(t);
            return status === 'previsto' || status === 'atrasado';
        }

        function isTransactionCancelled(t) {
            return getDerivedStatus(t) === 'cancelado';
        }

        function findTransactionById(id) {
            return data.transacoes.find(t => String(t.id) === String(id));
        }

        function syncInvoiceStatusFromPaymentTransaction(t) {
    if (!t || t.tipo !== 'dinheiro' || t.origem !== 'fatura') {
        return null;
    }

    const status = getDerivedStatus(t);
    if (status !== 'confirmado' && t.realizado !== true) {
        return null;
    }

    let invoice = null;

    if (t.invoiceId && Array.isArray(data.cardInvoices)) {
        invoice = data.cardInvoices.find(inv => String(inv.id) === String(t.invoiceId));
    }

    if (!invoice && t.cardId && t.invoiceMonth) {
        invoice = getOrCreateCardInvoice(t.cardId, t.invoiceMonth);
    }

    if (!invoice) {
        return null;
    }

    const now = new Date().toISOString();

    invoice.paymentTransactionId = t.id;
    invoice.status = 'paga';
    invoice.paidAt = t.confirmedAt || now;
    invoice.paidDate = t.dataRealizada || getTodayDateString();
    invoice.updatedAt = now;

    return invoice;
}

function confirmTransaction(id) {
            const t = findTransactionById(id);
            if (!t) return alert('Lancamento nao encontrado.');
            if (t.tipo !== 'dinheiro') return alert('A baixa manual esta disponivel apenas para entradas e saidas.');
            if (isTransactionConfirmed(t)) return alert('Este lancamento ja foi confirmado.');
            if (isTransactionCancelled(t)) return alert('Este lancamento foi cancelado e nao pode ser confirmado.');

            const valorPrevisto = getTransactionPlannedValue(t);
            const dataPrevista = getTransactionPlannedDate(t);

            const valorInput = prompt('Valor realizado:', String(valorPrevisto).replace('.', ','));
            if (valorInput === null) return;

            const valorRealizado = Number(valorInput.replace(',', '.'));
            if (!Number.isFinite(valorRealizado) || valorRealizado < 0) {
                return alert('Valor invalido.');
            }

            const dataInput = prompt('Data realizada (YYYY-MM-DD):', getTodayDateString() || dataPrevista || '');
            if (dataInput === null) return;

            const dataRealizada = dataInput.trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRealizada)) {
                return alert('Data invalida.');
            }

            const observacaoInput = prompt('Observacao (opcional):', t.observacao || '');
            const observacao = observacaoInput === null ? '' : observacaoInput.trim();
            const now = new Date().toISOString();

            if (t.valorPrevisto === undefined || t.valorPrevisto === null) t.valorPrevisto = t.valor;
            if (!t.dataPrevista) t.dataPrevista = t.data;

            t.status = 'confirmado';
            t.realizado = true;
            t.valorRealizado = valorRealizado;
            t.dataRealizada = dataRealizada;
            t.confirmedAt = now;
            t.updatedAt = now;
            if (observacao) t.observacao = observacao;

            syncInvoiceStatusFromPaymentTransaction(t);

    saveData();
            updateSemanal();
            renderTodasTransacoes();
            alert('Lancamento confirmado com sucesso.');
        }

        function getConfirmButtonHtml(t) {
            if (t.tipo !== 'dinheiro' || !isTransactionPendingLike(t)) return '';

            const id = encodeURIComponent(String(t.id));
            return `<button class="success" style="padding: 6px 12px;" onclick="confirmTransaction(decodeURIComponent('${id}'))">Dar baixa</button>`;
        }

        function parseCurrencyInput(value) {
            const normalized = typeof value === 'string' ? value.replace(',', '.') : value;
            return Number(normalized);
        }

        function isBalanceAdjustmentTransaction(t) {
            return t.origem === 'ajuste' || t.tipo === 'ajuste' || t.categoria === 'Ajuste de saldo';
        }

        function getTransactionDateForCashFlow(t) {
            if (isTransactionCancelled(t)) return null;
            if (isTransactionConfirmed(t)) return getTransactionActualDate(t) || getTransactionPlannedDate(t);
            if (isTransactionPendingLike(t)) return getTransactionPlannedDate(t);
            return null;
        }

        function getTransactionValueForCashFlow(t) {
            if (isTransactionCancelled(t)) return 0;
            if (isTransactionConfirmed(t)) return getTransactionActualValue(t);
            if (isTransactionPendingLike(t)) return getTransactionPlannedValue(t);
            return 0;
        }

        function calculateWeekFlow(weekOffset) {
            const { inicio, fim } = getWeekRange(weekOffset);
            const flow = {
                entradasConfirmadas: 0,
                entradasPrevistas: 0,
                saidasConfirmadas: 0,
                saidasPrevistas: 0,
                entradasTotal: 0,
                saidasTotal: 0,
                resultadoConfirmado: 0,
                resultadoPendente: 0,
                resultadoProjetado: 0,
                transacoesSemana: []
            };

            data.transacoes.forEach(t => {
                if (t.tipo !== 'dinheiro' || isBalanceAdjustmentTransaction(t) || isTransactionCancelled(t)) return;

                const dataReferencia = getTransactionDateForCashFlow(t);
                if (!dataReferencia) return;

                const dataT = new Date(dataReferencia + 'T12:00:00');
                if (dataT < inicio || dataT > fim) return;

                const valor = getTransactionValueForCashFlow(t);
                const confirmado = isTransactionConfirmed(t);
                flow.transacoesSemana.push(t);

                if (t.subTipo === 'entrada') {
                    if (confirmado) {
                        flow.entradasConfirmadas += valor;
                    } else {
                        flow.entradasPrevistas += valor;
                    }
                } else {
                    if (confirmado) {
                        flow.saidasConfirmadas += valor;
                    } else {
                        flow.saidasPrevistas += valor;
                    }
                }
            });

            flow.entradasTotal = flow.entradasConfirmadas + flow.entradasPrevistas;
            flow.saidasTotal = flow.saidasConfirmadas + flow.saidasPrevistas;
            flow.resultadoConfirmado = flow.entradasConfirmadas - flow.saidasConfirmadas;
            flow.resultadoPendente = flow.entradasPrevistas - flow.saidasPrevistas;
            flow.resultadoProjetado = flow.entradasTotal - flow.saidasTotal;

            return flow;
        }

        function calculateProjectedOpeningBalanceForWeek(weekOffset) {
            const base = Number(data.saldoAtual) || 0;
            // Semana atual e semanas passadas ainda usam o saldo informado; hist?rico passado completo fica para patch futuro.
            if (weekOffset <= 0) return base;

            // Semanas futuras herdam o saldo projetado das semanas anteriores.
            let saldo = base;
            for (let i = 0; i < weekOffset; i++) {
                const flow = calculateWeekFlow(i);
                saldo += flow.entradasTotal - flow.saidasTotal;
            }
            return saldo;
        }

        function createBalanceAdjustmentTransaction(previousBalance, newBalance) {
            const difference = newBalance - previousBalance;
            if (difference === 0) return null;

            const now = new Date().toISOString();
            const today = getTodayDateString();
            const valorAbs = Math.abs(difference);

            return {
                id: Date.now() + Math.random(),
                tipo: 'dinheiro',
                subTipo: difference > 0 ? 'entrada' : 'saida',
                data: today,
                valor: valorAbs,
                categoria: 'Ajuste de saldo',
                responsavel: 'Sistema',
                descricao: 'Corre??o manual de saldo',
                recorrente: false,
                realizado: true,
                accountId: 'conta-principal',
                dataPrevista: today,
                valorPrevisto: valorAbs,
                status: 'confirmado',
                dataRealizada: today,
                valorRealizado: valorAbs,
                confirmedAt: now,
                origem: 'ajuste',
                observacao: `Saldo anterior: ${previousBalance}; saldo informado: ${newBalance}; diferen?a: ${difference}`,
                createdAt: now,
                updatedAt: now
            };
        }

        // ========== NAVEGAÇÃO ==========
        function showPage(pageId) {
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

            const page = document.getElementById(pageId);
            if (page) {
                page.classList.add('active');
            }

            const tab = Array.from(document.querySelectorAll('.nav-tab')).find(button => {
                const onclick = button.getAttribute('onclick') || '';
                return onclick.includes(`showPage('${pageId}')`) || onclick.includes(`showPage("${pageId}")`);
            });

            if (tab) {
                tab.classList.add('active');
            }

            if (pageId === 'semanal') updateSemanal();
            if (pageId === 'cartoes') updateFaturas();
            if (pageId === 'mercado') updateMercado();
    if (pageId === 'treinamento') renderTrainingModule();
    if (pageId === 'dashboard') renderDashboard();
        }

        // ========== SALDO ==========
        function updateSaldoAtual() {
            const valor = parseCurrencyInput(document.getElementById('inputSaldoAtual').value);
            if (!Number.isFinite(valor) || valor < 0) return alert('Digite um saldo v?lido.');

            const previousBalance = Number(data.saldoAtual) || 0;
            const newBalance = valor;
            const difference = newBalance - previousBalance;

            if (difference === 0) {
                document.getElementById('inputSaldoAtual').value = '';
                return alert('O saldo informado j? ? igual ao saldo atual.');
            }

            const ajuste = createBalanceAdjustmentTransaction(previousBalance, newBalance);
            if (ajuste) {
                if (!data.categorias.includes('Ajuste de saldo')) data.categorias.push('Ajuste de saldo');
                if (!data.responsaveis.includes('Sistema')) data.responsaveis.push('Sistema');
                data.transacoes.push(ajuste);
            }

            data.saldoAtual = newBalance;
            saveData();
            updateSemanal();
            renderTodasTransacoes();
            updateAllSelects();
            renderCategorias();
            renderResponsaveis();
            document.getElementById('inputSaldoAtual').value = '';
            alert(`Saldo ajustado com hist?rico. Diferen?a registrada: ${formatCurrency(Math.abs(difference))}`);
        }

        // ========== METAS E RESERVAS ==========
        function saveMetasReservas() {
            const fundo = parseFloat(document.getElementById('configFundoEmergencia').value) || 0;
            const meta = parseFloat(document.getElementById('configMetaEconomia').value) || 0;
            
            data.fundoEmergencia = fundo;
            data.metaEconomia = meta;
            saveData();
            updateSemanal();
            alert('Metas salvas com sucesso!');
        }

        function loadMetasReservas() {
            document.getElementById('configFundoEmergencia').value = data.fundoEmergencia || 0;
            document.getElementById('configMetaEconomia').value = data.metaEconomia || 0;
        }

        // ========== CATEGORIAS ==========
        function addCategoria() {
            const input = document.getElementById('novaCategoria');
            const nome = input.value.trim();
            if (!nome) return alert('Digite um nome!');
            if (data.categorias.includes(nome)) return alert('Categoria já existe!');
            
            data.categorias.push(nome);
            saveData();
            input.value = '';
            renderCategorias();
            updateAllSelects();
        }

        function removeCategoria(nome) {
            if (confirm(`Remover categoria "${nome}"?`)) {
                data.categorias = data.categorias.filter(c => c !== nome);
                saveData();
                renderCategorias();
                updateAllSelects();
            }
        }

        function renderCategorias() {
            const html = data.categorias.map(c => `
                <div class="list-item">
                    <span>${c}</span>
                    <button class="danger" style="padding: 6px 12px;" onclick="removeCategoria('${c}')">Remover</button>
                </div>
            `).join('');
            document.getElementById('listaCategorias').innerHTML = html || '<div class="empty-state">Nenhuma categoria cadastrada</div>';
        }

        // ========== RESPONSÁVEIS ==========
        function addResponsavel() {
            const input = document.getElementById('novoResponsavel');
            const nome = input.value.trim();
            if (!nome) return alert('Digite um nome!');
            if (data.responsaveis.includes(nome)) return alert('Responsável já existe!');
            
            data.responsaveis.push(nome);
            saveData();
            input.value = '';
            renderResponsaveis();
            updateAllSelects();
        }

        function removeResponsavel(nome) {
            if (confirm(`Remover responsável "${nome}"?`)) {
                data.responsaveis = data.responsaveis.filter(r => r !== nome);
                saveData();
                renderResponsaveis();
                updateAllSelects();
            }
        }

        function renderResponsaveis() {
            const html = data.responsaveis.map(r => `
                <div class="list-item">
                    <span>${r}</span>
                    <button class="danger" style="padding: 6px 12px;" onclick="removeResponsavel('${r}')">Remover</button>
                </div>
            `).join('');
            document.getElementById('listaResponsaveis').innerHTML = html || '<div class="empty-state">Nenhum responsável cadastrado</div>';
        }

        function getInvoiceKey(cardId, monthRef) {
            return `${cardId}_${monthRef}`;
        }

        function normalizeMonthRef(monthRef) {
            if (typeof monthRef !== 'string') return null;
            if (/^\d{4}-\d{2}$/.test(monthRef)) return monthRef;
            if (/^\d{4}-\d{2}-\d{2}$/.test(monthRef)) return monthRef.slice(0, 7);
            return null;
        }

        function findCardById(cardId) {
            return data.cartoes.find(c => String(c.id) === String(cardId));
        }

        function createCardInvoiceIfMissing(cardId, monthRef) {
            const normalizedMonthRef = normalizeMonthRef(monthRef);
            const card = findCardById(cardId);
            if (!normalizedMonthRef || !card) return null;

            const invoiceId = getInvoiceKey(cardId, normalizedMonthRef);
            const existing = data.cardInvoices.find(invoice => invoice.id === invoiceId);
            if (existing) return existing;

            const now = new Date().toISOString();
            const invoice = {
                id: invoiceId,
                cardId,
                monthRef: normalizedMonthRef,
                status: 'aberta',
                paymentTransactionId: null,
                paidAt: null,
                createdAt: now,
                updatedAt: now
            };
            data.cardInvoices.push(invoice);
            return invoice;
        }

        function getOrCreateCardInvoice(cardId, monthRef) {
            return createCardInvoiceIfMissing(cardId, monthRef);
        }

        function getCardInvoice(cardId, monthRef) {
            const normalizedMonthRef = normalizeMonthRef(monthRef);
            if (!normalizedMonthRef) return null;
            const invoiceId = getInvoiceKey(cardId, normalizedMonthRef);
            return data.cardInvoices.find(invoice => invoice.id === invoiceId) || null;
        }

        function getCardInvoiceStatus(cardId, monthRef) {
            const invoice = getCardInvoice(cardId, monthRef);
            return invoice?.status || 'aberta';
        }

        function updateCardInvoiceStatus(cardId, monthRef, status) {
            if (!['aberta', 'fechada', 'paga'].includes(status)) return alert('Status de fatura invalido.');
            const invoice = getOrCreateCardInvoice(cardId, monthRef);
            if (!invoice) return alert('Fatura nao encontrada.');

            invoice.status = status;
            invoice.updatedAt = new Date().toISOString();
            invoice.paidAt = status === 'paga' ? new Date().toISOString() : null;

            saveData();
            updateFaturas();
        }

        function getInvoiceStatusBadgeHtml(status) {
            if (status === 'paga') return '<span class="badge status-realizado">Paga</span>';
            if (status === 'fechada') return '<span class="badge status-planejado">Fechada</span>';
            return '<span class="badge status-planejado">Aberta</span>';
        }

        function addMonthsToMonthRef(monthRef, monthsToAdd) {
            const normalizedMonthRef = normalizeMonthRef(monthRef);
            if (!normalizedMonthRef) return null;

            const [year, month] = normalizedMonthRef.split('-').map(Number);
            const date = new Date(year, month - 1 + monthsToAdd, 1);
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        }

        function getFirstInvoiceMonthForPurchase(card, purchaseDate) {
            if (!card || !purchaseDate) return null;
            const date = new Date(purchaseDate + 'T12:00:00');
            if (Number.isNaN(date.getTime())) return null;

            let month = date.getMonth();
            let year = date.getFullYear();
            if (date.getDate() > card.diaFechamento) {
                month++;
                if (month > 11) {
                    month = 0;
                    year++;
                }
            }
            return `${year}-${String(month + 1).padStart(2, '0')}`;
        }

        function generateCardItemInstallmentsPreview(item) {
            if (!item || item.status === 'cancelled') return [];

            const card = findCardById(item.cardId);
            const firstInvoiceMonth = normalizeMonthRef(item.firstInvoiceMonth) || getFirstInvoiceMonthForPurchase(card, item.purchaseDate);
            if (!firstInvoiceMonth) return [];

            if (item.type === 'single') {
                const amount = Number(item.totalAmount ?? item.installmentAmount ?? 0) || 0;
                return [{
                    cardItemId: item.id,
                    installmentNumber: 1,
                    totalInstallments: 1,
                    invoiceMonth: firstInvoiceMonth,
                    amount
                }];
            }

            if (item.type === 'installment') {
                const totalInstallments = Number(item.totalInstallments) || 0;
                if (totalInstallments <= 0) return [];

                const amount = (Number(item.installmentAmount) || 0) || ((Number(item.totalAmount) || 0) / totalInstallments);
                const installments = [];
                for (let i = 1; i <= totalInstallments; i++) {
                    installments.push({
                        cardItemId: item.id,
                        installmentNumber: i,
                        totalInstallments,
                        invoiceMonth: addMonthsToMonthRef(firstInvoiceMonth, i - 1),
                        amount
                    });
                }
                return installments;
            }

            if (item.type === 'existing_installment') {
                const firstInstallmentNumber = Number(item.firstInstallmentNumber) || 1;
                const totalInstallments = Number(item.totalInstallments) || firstInstallmentNumber;
                const amount = Number(item.installmentAmount ?? item.totalAmount ?? 0) || 0;
                const installments = [];
                for (let number = firstInstallmentNumber; number <= totalInstallments; number++) {
                    installments.push({
                        cardItemId: item.id,
                        installmentNumber: number,
                        totalInstallments,
                        invoiceMonth: addMonthsToMonthRef(firstInvoiceMonth, number - firstInstallmentNumber),
                        amount
                    });
                }
                return installments;
            }

            if (item.type === 'recurring') {
                return [];
            }

            return [];
        }

        // ========== CARTÕES ==========
        function addCartao() {
            const nome = document.getElementById('nomeCartao').value.trim();
            const limite = parseFloat(document.getElementById('limiteCartao').value);
            const diaFechamento = parseInt(document.getElementById('diaFechamento').value);
            const diaPagamento = parseInt(document.getElementById('diaPagamento').value);

            if (!nome || !limite || !diaFechamento || !diaPagamento) {
                return alert('Preencha todos os campos!');
            }

            data.cartoes.push({
                id: Date.now(),
                nome,
                limite,
                diaFechamento,
                diaPagamento
            });

            saveData();
            document.getElementById('nomeCartao').value = '';
            document.getElementById('limiteCartao').value = '';
            document.getElementById('diaFechamento').value = '';
            document.getElementById('diaPagamento').value = '';
            
            renderCartoes();
            updateAllSelects();
            alert('Cartão cadastrado com sucesso!');
        }

        function removeCartao(id) {
            if (confirm('Remover este cartão?')) {
                data.cartoes = data.cartoes.filter(c => c.id !== id);
                saveData();
                renderCartoes();
                updateAllSelects();
            }
        }

        function renderCartoes() {
            const container = document.getElementById('listaCartoes');
            if (data.cartoes.length === 0) {
                container.innerHTML = '<div class="empty-state">Nenhum cartão cadastrado</div>';
                return;
            }

            const html = data.cartoes.map(cartao => {
                const usado = calcularUsadoCartao(cartao.id);
                const disponivel = cartao.limite - usado;
                const percentual = (usado / cartao.limite) * 100;

                let barClass = '';
                let alertMsg = '';
                if (percentual >= 30) {
                    barClass = percentual >= 50 ? 'danger' : 'warning';
                    alertMsg = percentual >= 30 ? `<div class="alert alert-warning" style="margin-top: 10px;">⚠️ Você está usando ${percentual.toFixed(0)}% do limite!</div>` : '';
                }

                return `
                    <div class="credit-card-box">
                        <h3>${cartao.nome}</h3>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span>Limite:</span>
                            <span>${formatCurrency(cartao.limite)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <span>Usado:</span>
                            <span>${formatCurrency(usado)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Disponível:</span>
                            <span>${formatCurrency(disponivel)}</span>
                        </div>
                        <div class="limit-bar">
                            <div class="limit-bar-fill ${barClass}" style="width: ${percentual}%"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 13px;">
                            <span>Fecha dia ${cartao.diaFechamento}</span>
                            <span>Paga dia ${cartao.diaPagamento}</span>
                        </div>
                        ${alertMsg}
                        <button class="danger" style="margin-top: 10px; padding: 8px 16px;" onclick="removeCartao(${cartao.id})">Remover Cartão</button>
                    </div>
                `;
            }).join('');

            container.innerHTML = html;
        }

        function calcularUsadoCartao(cartaoId) {
            let total = 0;
            const hoje = new Date();
            data.transacoes.forEach(t => {
                if (t.tipo === 'cartao' && t.cartaoId === cartaoId) {
                    t.parcelas.forEach(p => {
                        const dataParcela = new Date(p.mesReferencia + '-15');
                        if (dataParcela >= hoje) {
                            total += p.valor;
                        }
                    });
                }
            });
            return total;
        }

        // ========== LANÇAMENTOS ==========
        function updateLancamentoForm() {
            const tipo = document.getElementById('tipoLancamento').value;
            document.getElementById('formDinheiro').style.display = tipo === 'dinheiro' ? 'block' : 'none';
            document.getElementById('formCartao').style.display = tipo === 'cartao' ? 'block' : 'none';
        }

        function addLancamentoDinheiro() {
            const tipo = document.getElementById('dinheiroTipo').value;
            const data_lancamento = document.getElementById('dinheiroData').value;
            const valor = parseFloat(document.getElementById('dinheiroValor').value);
            const categoria = document.getElementById('dinheiroCategoria').value;
            const responsavel = document.getElementById('dinheiroResponsavel').value;
            const descricao = document.getElementById('dinheiroDescricao').value.trim();
            const recorrente = document.getElementById('dinheiroRecorrente').checked;

            if (!data_lancamento || !valor || !categoria || !responsavel || !descricao) {
                return alert('Preencha todos os campos!');
            }

            const now = new Date().toISOString();
            data.transacoes.push({
                id: Date.now(),
                tipo: 'dinheiro',
                subTipo: tipo,
                data: data_lancamento,
                valor,
                categoria,
                responsavel,
                descricao,
                recorrente,
                realizado: false,
                accountId: 'conta-principal',
                dataPrevista: data_lancamento,
                valorPrevisto: valor,
                status: 'previsto',
                dataRealizada: null,
                valorRealizado: null,
                confirmedAt: null,
                origem: 'manual',
                observacao: '',
                createdAt: now,
                updatedAt: now
            });

            saveData();
            updateSemanal();
            
            document.getElementById('dinheiroValor').value = '';
            document.getElementById('dinheiroDescricao').value = '';
            document.getElementById('dinheiroRecorrente').checked = false;
            
            alert('Lançamento adicionado!');
            showPage('semanal');
        }

        function addLancamentoCartao() {
            const cartaoId = parseInt(document.getElementById('cartaoSelect').value);
            const dataCompra = document.getElementById('cartaoData').value;
            const valorTotal = parseFloat(document.getElementById('cartaoValor').value);
            const numParcelas = parseInt(document.getElementById('cartaoParcelas').value);
            const categoria = document.getElementById('cartaoCategoria').value;
            const responsavel = document.getElementById('cartaoResponsavel').value;
            const descricao = document.getElementById('cartaoDescricao').value.trim();

            if (!cartaoId || !dataCompra || !valorTotal || !numParcelas || !categoria || !responsavel || !descricao) {
                return alert('Preencha todos os campos!');
            }

            const cartao = data.cartoes.find(c => String(c.id) === String(cartaoId));
            const parcelas = gerarParcelas(dataCompra, valorTotal, numParcelas, cartao);

            data.transacoes.push({
                id: Date.now(),
                tipo: 'cartao',
                cartaoId,
                cartaoNome: cartao.nome,
                data: dataCompra,
                valorTotal,
                numParcelas,
                categoria,
                responsavel,
                descricao,
                parcelas
            });

            saveData();
            updateSemanal();
            
            document.getElementById('cartaoValor').value = '';
            document.getElementById('cartaoParcelas').value = '1';
            document.getElementById('cartaoDescricao').value = '';
            document.getElementById('cartaoPreview').style.display = 'none';
            
            alert('Compra adicionada!');
            showPage('cartoes');
        }

        function gerarParcelas(dataCompra, valorTotal, numParcelas, cartao) {
            const parcelas = [];
            const valorParcela = valorTotal / numParcelas;
            const dataCompraObj = new Date(dataCompra + 'T12:00:00');
            
            const diaCompra = dataCompraObj.getDate();
            let mesBase = dataCompraObj.getMonth();
            let anoBase = dataCompraObj.getFullYear();

            if (diaCompra > cartao.diaFechamento) {
                mesBase++;
                if (mesBase > 11) {
                    mesBase = 0;
                    anoBase++;
                }
            }

            for (let i = 0; i < numParcelas; i++) {
                let mes = mesBase + i;
                let ano = anoBase;
                
                while (mes > 11) {
                    mes -= 12;
                    ano++;
                }

                const mesRef = `${ano}-${String(mes + 1).padStart(2, '0')}`;
                
                parcelas.push({
                    numero: i + 1,
                    valor: valorParcela,
                    mesReferencia: mesRef
                });
            }

            return parcelas;
        }

        document.getElementById('cartaoSelect')?.addEventListener('change', updateCartaoPreview);
        document.getElementById('cartaoData')?.addEventListener('change', updateCartaoPreview);
        document.getElementById('cartaoValor')?.addEventListener('input', updateCartaoPreview);
        document.getElementById('cartaoParcelas')?.addEventListener('input', updateCartaoPreview);

        function updateCartaoPreview() {
            const cartaoId = parseInt(document.getElementById('cartaoSelect').value);
            const dataCompra = document.getElementById('cartaoData').value;
            const valorTotal = parseFloat(document.getElementById('cartaoValor').value);
            const numParcelas = parseInt(document.getElementById('cartaoParcelas').value);

            if (!cartaoId || !dataCompra || !valorTotal || !numParcelas) {
                document.getElementById('cartaoPreview').style.display = 'none';
                return;
            }

            const cartao = data.cartoes.find(c => String(c.id) === String(cartaoId));
            const parcelas = gerarParcelas(dataCompra, valorTotal, numParcelas, cartao);

            const preview = `
                <strong>Preview:</strong><br>
                ${numParcelas}x de ${formatCurrency(valorTotal / numParcelas)}<br>
                Primeira parcela: ${parcelas[0].mesReferencia} (vence dia ${cartao.diaPagamento})<br>
                Última parcela: ${parcelas[parcelas.length - 1].mesReferencia}
            `;

            document.getElementById('cartaoPreview').innerHTML = preview;
            document.getElementById('cartaoPreview').style.display = 'block';
        }

        function deleteTransacao(id) {
            if (confirm('Excluir este lançamento?')) {
                data.transacoes = data.transacoes.filter(t => t.id !== id);
                saveData();
                updateSemanal();
                renderTodasTransacoes();
            }
        }

        function renderTodasTransacoes() {
            const container = document.getElementById('todasTransacoes');
            if (data.transacoes.length === 0) {
                container.innerHTML = '<div class="empty-state">Nenhum lancamento ainda</div>';
                return;
            }

            const sorted = [...data.transacoes].sort((a, b) => new Date(b.data) - new Date(a.data));

            const html = sorted.map(t => {
                if (t.tipo === 'dinheiro') {
                    const statusBadge = getStatusBadgeHtml(t);
                    const confirmButton = getConfirmButtonHtml(t);
                    const valorExibicao = isTransactionConfirmed(t) ? getTransactionActualValue(t) : getTransactionPlannedValue(t);
                    const dataExibicao = isTransactionConfirmed(t) ? (getTransactionActualDate(t) || getTransactionPlannedDate(t)) : getTransactionPlannedDate(t);

                    return `
                        <div class="transaction-item">
                            <div class="transaction-info">
                                <div class="transaction-description">
                                    ${t.descricao}
                                    <span class="badge cat">${t.categoria}</span>
                                    <span class="badge resp">${t.responsavel}</span>
                                    ${statusBadge}
                                </div>
                                <div class="transaction-meta">${formatDate(dataExibicao || t.data)}</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end;">
                                <div class="transaction-amount ${t.subTipo === 'entrada' ? 'income' : 'expense'}">
                                    ${t.subTipo === 'entrada' ? '+' : '-'} ${formatCurrency(valorExibicao)}
                                </div>
                                ${confirmButton}
                                <button class="danger" style="padding: 6px 12px;" onclick="deleteTransacao(${t.id})">???</button>
                            </div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="transaction-item">
                            <div class="transaction-info">
                                <div class="transaction-description">
                                    ???? ${t.descricao}
                                    <span class="badge">${t.cartaoNome}</span>
                                    <span class="badge">${t.numParcelas}x</span>
                                </div>
                                <div class="transaction-meta">${formatDate(t.data)} - ${t.categoria} - ${t.responsavel}</div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="transaction-amount expense">
                                    ${formatCurrency(t.valorTotal)}
                                </div>
                                <button class="danger" style="padding: 6px 12px;" onclick="deleteTransacao(${t.id})">???</button>
                            </div>
                        </div>
                    `;
                }
            }).join('');

            container.innerHTML = html;
        }

        // ========== VISÃO SEMANAL ==========
        function changeWeek(offset) {
            if (offset === 0) {
                currentWeekOffset = 0;
            } else {
                currentWeekOffset += offset;
            }
            updateSemanal();
        }

        function getWeekRange(offset) {
            const hoje = new Date();
            hoje.setDate(hoje.getDate() + (offset * 7));
            
            const diaSemana = hoje.getDay();
            const inicioSemana = new Date(hoje);
            inicioSemana.setDate(hoje.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1));
            inicioSemana.setHours(0, 0, 0, 0);
            
            const fimSemana = new Date(inicioSemana);
            fimSemana.setDate(inicioSemana.getDate() + 6);
            fimSemana.setHours(23, 59, 59, 999);

            return { inicio: inicioSemana, fim: fimSemana };
        }

        function updateSemanal() {
            const { inicio: inicioSemana, fim: fimSemana } = getWeekRange(currentWeekOffset);
            const flow = calculateWeekFlow(currentWeekOffset);
            const saldoBase = calculateProjectedOpeningBalanceForWeek(currentWeekOffset);

            document.getElementById('weekInfo').textContent = 
                `${formatDate(inicioSemana.toISOString().split('T')[0])} - ${formatDate(fimSemana.toISOString().split('T')[0])}`;

            const saldoProjetadoSemana = saldoBase + flow.entradasTotal - flow.saidasTotal;
            const disponivelReal = saldoBase - data.fundoEmergencia;

            const setCardValue = (id, value, className) => {
                const el = document.getElementById(id);
                if (!el) return;
                el.textContent = formatCurrency(value);
                if (className) el.className = 'value ' + className;
            };

            // Semana atual usa o saldo informado; semanas futuras usam saldo projetado acumulado.
            document.getElementById('saldoAtual').textContent = formatCurrency(data.saldoAtual);
            document.getElementById('fundoEmergencia').textContent = formatCurrency(data.fundoEmergencia);
            document.getElementById('disponivelReal').textContent = formatCurrency(disponivelReal);
            document.getElementById('disponivelReal').className = 'value ' + (disponivelReal >= 0 ? 'positive' : 'negative');
            document.getElementById('metaEconomia').textContent = formatCurrency(data.metaEconomia);

            setCardValue('weekSaldoBase', saldoBase);
            setCardValue('weekEntradasConfirmadas', flow.entradasConfirmadas, 'positive');
            setCardValue('weekEntradasPrevistas', flow.entradasPrevistas, 'positive');
            setCardValue('weekSaidasConfirmadas', flow.saidasConfirmadas, 'negative');
            setCardValue('weekSaidasPrevistas', flow.saidasPrevistas, 'negative');
            setCardValue('weekSaldoProjetado', saldoProjetadoSemana, saldoProjetadoSemana >= 0 ? 'positive' : 'negative');
            setCardValue('weekResultadoPendente', flow.resultadoPendente, flow.resultadoPendente >= 0 ? 'positive' : 'negative');

            setCardValue('weekPlanejado', flow.saidasPrevistas);
            setCardValue('weekRealizado', flow.saidasConfirmadas);
            setCardValue('weekEntradas', flow.entradasTotal);

            // Alertas
            renderAlertas(saldoProjetadoSemana, disponivelReal);

            // Transacoes da semana
            renderTransacoesSemana(flow.transacoesSemana);

            // Projecao do mes
            updateProjecaoMes();

            // Timeline
            renderTimeline();

            // Renderizar todas transacoes
            renderTodasTransacoes();
        }

        function renderAlertas(saldoProjetadoSemana, disponivelReal) {
            const container = document.getElementById('weekAlerts');
            const alertas = [];

            if (saldoProjetadoSemana < 0) {
                alertas.push('<div class="alert alert-danger">⚠️ ATENÇÃO: Gastos desta semana vão deixar o saldo negativo!</div>');
            }

            if (disponivelReal < 0) {
                alertas.push('<div class="alert alert-warning">💡 Você está usando o fundo de emergência! Cuidado com novos gastos.</div>');
            }

            if (saldoProjetadoSemana > 0 && saldoProjetadoSemana < data.fundoEmergencia * 0.5) {
                alertas.push('<div class="alert alert-warning">⚠️ Projeção indica saldo baixo no fim da semana. Evite gastos extras!</div>');
            }

            container.innerHTML = alertas.join('');
        }

        function renderTransacoesSemana(transacoes) {
            const container = document.getElementById('weekTransacoes');
            
            if (transacoes.length === 0) {
                container.innerHTML = '<div class="empty-state">Nenhum lancamento nesta semana</div>';
                return;
            }

            const sorted = transacoes.sort((a, b) => {
                const dataA = isTransactionConfirmed(a) ? (getTransactionActualDate(a) || getTransactionPlannedDate(a)) : getTransactionPlannedDate(a);
                const dataB = isTransactionConfirmed(b) ? (getTransactionActualDate(b) || getTransactionPlannedDate(b)) : getTransactionPlannedDate(b);
                return new Date((dataA || '') + 'T12:00:00') - new Date((dataB || '') + 'T12:00:00');
            });

            const html = sorted.map(t => {
                const statusBadge = getStatusBadgeHtml(t);
                const confirmButton = getConfirmButtonHtml(t);
                const dataExibicao = isTransactionConfirmed(t) ? (getTransactionActualDate(t) || getTransactionPlannedDate(t)) : getTransactionPlannedDate(t);
                const valorExibicao = isTransactionConfirmed(t) ? getTransactionActualValue(t) : getTransactionPlannedValue(t);

                return `
                    <div class="transaction-item">
                        <div class="transaction-info">
                            <div class="transaction-description">
                                ${t.descricao}
                                <span class="badge cat">${t.categoria}</span>
                                ${statusBadge}
                            </div>
                            <div class="transaction-meta">${formatDate(dataExibicao || t.data)} - ${t.responsavel}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end;">
                            <div class="transaction-amount ${t.subTipo === 'entrada' ? 'income' : 'expense'}">
                                ${t.subTipo === 'entrada' ? '+' : '-'} ${formatCurrency(valorExibicao)}
                            </div>
                            ${confirmButton}
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = html;
        }

        function updateProjecaoMes() {
            const hoje = new Date(getTodayDateString() + 'T12:00:00');
            const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);

            let entradasMes = 0;
            let saidasMes = 0;

            data.transacoes.forEach(t => {
                if (t.tipo !== 'dinheiro' || isTransactionCancelled(t) || isBalanceAdjustmentTransaction(t)) return;

                const confirmado = isTransactionConfirmed(t);
                const pendente = isTransactionPendingLike(t);
                if (!confirmado && !pendente) return;

                // Confirmado usa valor real; previsto/atrasado usa valor previsto; cancelado e ignorado.
                const dataReferencia = confirmado
                    ? (getTransactionActualDate(t) || getTransactionPlannedDate(t))
                    : getTransactionPlannedDate(t);
                if (!dataReferencia) return;

                const dataT = new Date(dataReferencia + 'T12:00:00');
                if (dataT >= hoje && dataT <= fimMes) {
                    const valor = confirmado ? getTransactionActualValue(t) : getTransactionPlannedValue(t);
                    if (t.subTipo === 'entrada') {
                        entradasMes += valor;
                    } else {
                        saidasMes += valor;
                    }
                }
            });

            const saldoFinal = data.saldoAtual + entradasMes - saidasMes;
            const resultadoVsMeta = saldoFinal - (data.saldoAtual - data.metaEconomia);

            document.getElementById('mesEntradas').textContent = formatCurrency(entradasMes);
            document.getElementById('mesSaidas').textContent = formatCurrency(saidasMes);
            document.getElementById('mesSaldoFinal').textContent = formatCurrency(saldoFinal);
            document.getElementById('mesSaldoFinal').className = 'value ' + (saldoFinal >= 0 ? 'positive' : 'negative');
            document.getElementById('mesResultadoMeta').textContent = formatCurrency(resultadoVsMeta);
            document.getElementById('mesResultadoMeta').className = 'value ' + (resultadoVsMeta >= 0 ? 'positive' : 'negative');
        }

        function renderTimeline() {
            const container = document.getElementById('timelineProjecao');
            const semanas = [];

            for (let i = 0; i < 4; i++) {
                const { inicio, fim } = getWeekRange(i);
                const flow = calculateWeekFlow(i);
                const saldoInicial = calculateProjectedOpeningBalanceForWeek(i);
                const saldoProjetado = saldoInicial + flow.entradasTotal - flow.saidasTotal;

                semanas.push({
                    numero: i + 1,
                    inicio: formatDate(inicio.toISOString().split('T')[0]),
                    fim: formatDate(fim.toISOString().split('T')[0]),
                    entradas: flow.entradasTotal,
                    saidas: flow.saidasTotal,
                    saldoProjetado,
                    isCurrent: i === currentWeekOffset
                });
            }

            const html = semanas.map(s => {
                const classes = ['week-projection'];
                if (s.isCurrent) classes.push('current');
                if (s.saldoProjetado < 0) classes.push('negative');

                return `
                    <div class="${classes.join(' ')}">
                        <div class="week-projection-header">
                            <strong>Semana ${s.numero}: ${s.inicio} - ${s.fim}</strong>
                            <strong style="color: ${s.saldoProjetado >= 0 ? '#27ae60' : '#e74c3c'}">
                                ${formatCurrency(s.saldoProjetado)}
                            </strong>
                        </div>
                        <div class="week-projection-details">
                            <div>&#128176; Entradas: <strong style="color: #27ae60">${formatCurrency(s.entradas)}</strong></div>
                            <div>&#128184; Saidas: <strong style="color: #e74c3c">${formatCurrency(s.saidas)}</strong></div>
                            <div>&#128202; Resultado: <strong>${formatCurrency(s.entradas - s.saidas)}</strong></div>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = html;
        }

        // ========== MERCADO ==========
        function addProdutoLista() {
            const nome = document.getElementById('produtoNome').value.trim();
            const qtd = document.getElementById('produtoQtd').value.trim();
            const preco = parseFloat(document.getElementById('produtoPreco').value);

            if (!nome || !qtd || isNaN(preco)) {
                return alert('Preencha todos os campos!');
            }

            // Adicionar ao histórico de preços
            if (!data.historicoPrecos[nome]) {
                data.historicoPrecos[nome] = [];
            }
            data.historicoPrecos[nome].push({
                data: new Date().toISOString().split('T')[0],
                preco,
                qtd
            });

            // Adicionar à lista
            data.listaMercado.push({
                id: Date.now(),
                nome,
                qtd,
                preco,
                comprado: false
            });

            saveData();
            updateMercado();

            document.getElementById('produtoNome').value = '';
            document.getElementById('produtoQtd').value = '';
            document.getElementById('produtoPreco').value = '';
        }

        function toggleProdutoComprado(id) {
            const produto = data.listaMercado.find(p => p.id === id);
            if (produto) {
                produto.comprado = !produto.comprado;
                saveData();
                updateMercado();
            }
        }

        function removeProdutoLista(id) {
            data.listaMercado = data.listaMercado.filter(p => p.id !== id);
            saveData();
            updateMercado();
        }

        function updateMercado() {
            renderListaCompras();
            renderHistoricoPrecos();
            calcularGastosMercado();
        }

        function renderListaCompras() {
            const container = document.getElementById('listaCompras');
            
            if (data.listaMercado.length === 0) {
                container.innerHTML = '<div class="empty-state">Lista vazia</div>';
                document.getElementById('totalLista').textContent = 'R$ 0,00';
                return;
            }

            let total = 0;
            const html = data.listaMercado.map(p => {
                total += p.preco;
                return `
                    <div class="market-item ${p.comprado ? 'checked' : ''}">
                        <div style="display: flex; align-items: center; flex: 1;">
                            <input type="checkbox" ${p.comprado ? 'checked' : ''} onchange="toggleProdutoComprado(${p.id})">
                            <div>
                                <div style="font-weight: 600;">${p.nome}</div>
                                <div style="font-size: 12px; color: #7f8c8d;">${p.qtd}</div>
                            </div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <strong>${formatCurrency(p.preco)}</strong>
                            <button class="danger" style="padding: 4px 8px; font-size: 12px;" onclick="removeProdutoLista(${p.id})">✕</button>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = html;
            document.getElementById('totalLista').textContent = formatCurrency(total);
        }

        function renderHistoricoPrecos() {
            const container = document.getElementById('historicoPrecos');
            
            if (Object.keys(data.historicoPrecos).length === 0) {
                container.innerHTML = '<div class="empty-state">Nenhum histórico ainda</div>';
                return;
            }

            const html = Object.entries(data.historicoPrecos).map(([produto, historico]) => {
                const sorted = [...historico].sort((a, b) => new Date(b.data) - new Date(a.data));
                const ultimo = sorted[0];
                const penultimo = sorted[1];

                let trend = '';
                if (penultimo) {
                    if (ultimo.preco > penultimo.preco) {
                        const diff = ((ultimo.preco - penultimo.preco) / penultimo.preco * 100).toFixed(0);
                        trend = `<span class="price-trend up">↑ ${diff}%</span>`;
                    } else if (ultimo.preco < penultimo.preco) {
                        const diff = ((penultimo.preco - ultimo.preco) / penultimo.preco * 100).toFixed(0);
                        trend = `<span class="price-trend down">↓ ${diff}%</span>`;
                    } else {
                        trend = `<span class="price-trend same">━ 0%</span>`;
                    }
                }

                return `
                    <div class="list-item">
                        <div>
                            <div style="font-weight: 600;">${produto}</div>
                            <div class="price-history">
                                Último: ${formatCurrency(ultimo.preco)} (${formatDate(ultimo.data)})
                                ${trend}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = html;
        }

        function calcularGastosMercado() {
            const hoje = new Date();
            const { inicio: inicioSemana, fim: fimSemana } = getWeekRange(0);
            const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

            let gastoSemana = 0;
            let gastoMes = 0;
            let totalSemanas = 0;
            let numSemanas = 0;

            data.transacoes.forEach(t => {
                if (t.tipo === 'dinheiro' && t.categoria && t.categoria.startsWith('Mercado')) {
                    const dataT = new Date(t.data + 'T12:00:00');
                    
                    if (dataT >= inicioSemana && dataT <= fimSemana) {
                        gastoSemana += t.valor;
                    }
                    
                    if (dataT >= inicioMes && dataT <= fimMes) {
                        gastoMes += t.valor;
                    }

                    // Para calcular média (últimas 8 semanas)
                    const diff = Math.floor((hoje - dataT) / (7 * 24 * 60 * 60 * 1000));
                    if (diff >= 0 && diff < 8) {
                        totalSemanas += t.valor;
                        numSemanas = Math.max(numSemanas, diff + 1);
                    }
                }
            });

            const media = numSemanas > 0 ? totalSemanas / numSemanas : 0;

            document.getElementById('mercadoSemana').textContent = formatCurrency(gastoSemana);
            document.getElementById('mercadoMes').textContent = formatCurrency(gastoMes);
            document.getElementById('mercadoMedia').textContent = formatCurrency(media);
        }

        function updateCardItemForm() {
            const type = document.getElementById('cardItemType')?.value;
            const parcelas = document.getElementById('cardItemTotalInstallments');
            const parcelaAtual = document.getElementById('cardItemFirstInstallmentNumber');
            const valorParcela = document.getElementById('cardItemInstallmentAmount');
            const firstInvoiceMonth = document.getElementById('cardItemFirstInvoiceMonth');

            if (parcelas) {
                parcelas.disabled = type === 'single' || type === 'recurring';
                if (type === 'single' || type === 'recurring') parcelas.value = '1';
            }

            if (parcelaAtual) {
                parcelaAtual.disabled = type !== 'existing_installment';
                if (type !== 'existing_installment') parcelaAtual.value = '1';
            }

            if (valorParcela) {
                valorParcela.disabled = type !== 'existing_installment';
                if (type !== 'existing_installment') valorParcela.value = '';
            }

            if (firstInvoiceMonth) {
                firstInvoiceMonth.disabled = !(type === 'existing_installment' || type === 'recurring');
            }

            updateCardItemPreview();
        }

        function buildCardRecurringItemFromForm() {
            const cardId = document.getElementById('cardItemCardId')?.value;
            const description = document.getElementById('cardItemDescription')?.value.trim();
            const amount = parseCurrencyInput(document.getElementById('cardItemTotalAmount')?.value);
            const startInvoiceMonth = normalizeMonthRef(document.getElementById('cardItemFirstInvoiceMonth')?.value);
            const category = document.getElementById('cardItemCategory')?.value;
            const responsible = document.getElementById('cardItemResponsible')?.value;

            if (!cardId) return { error: 'Selecione um cartao.' };
            const card = findCardById(cardId);
            if (!card) return { error: 'Cartao nao encontrado.' };
            if (!description) return { error: 'Informe a descricao.' };
            if (!Number.isFinite(amount) || amount <= 0) return { error: 'Informe um valor mensal valido.' };
            if (!startInvoiceMonth) return { error: 'Informe o mes inicial.' };
            if (!category) return { error: 'Informe a categoria.' };
            if (!responsible) return { error: 'Informe o responsavel.' };

            const now = new Date().toISOString();
            return {
                item: {
                    id: Date.now() + Math.random(),
                    cardId: card.id,
                    cardName: card.nome,
                    description,
                    category,
                    responsible,
                    amount,
                    startInvoiceMonth,
                    endInvoiceMonth: null,
                    status: 'active',
                    createdAt: now,
                    updatedAt: now
                }
            };
        }
        function buildCardItemFromForm() {
            const cardId = document.getElementById('cardItemCardId')?.value;
            const type = document.getElementById('cardItemType')?.value;
            const purchaseDate = document.getElementById('cardItemPurchaseDate')?.value;
            const description = document.getElementById('cardItemDescription')?.value.trim();
            const totalAmountInput = parseCurrencyInput(document.getElementById('cardItemTotalAmount')?.value);
            let totalInstallments = parseInt(document.getElementById('cardItemTotalInstallments')?.value, 10);
            let firstInstallmentNumber = parseInt(document.getElementById('cardItemFirstInstallmentNumber')?.value, 10);
            const firstInvoiceMonthInput = document.getElementById('cardItemFirstInvoiceMonth')?.value;
            const installmentAmountInput = parseCurrencyInput(document.getElementById('cardItemInstallmentAmount')?.value);
            const category = document.getElementById('cardItemCategory')?.value;
            const responsible = document.getElementById('cardItemResponsible')?.value;

            if (!cardId) return { error: 'Selecione um cartao.' };
            const card = findCardById(cardId);
            if (!card) return { error: 'Cartao nao encontrado.' };
            if (!type || !['single', 'installment', 'existing_installment', 'recurring'].includes(type)) return { error: 'Tipo invalido.' };
            if (!description) return { error: 'Informe a descricao.' };
            if (!category) return { error: 'Informe a categoria.' };
            if (!responsible) return { error: 'Informe o responsavel.' };
            if (!Number.isFinite(totalInstallments) || totalInstallments < 1) return { error: 'Informe um numero de parcelas valido.' };

            let totalAmount = totalAmountInput;
            let installmentAmount;
            let firstInvoiceMonth;

            if (type === 'existing_installment') {
                firstInstallmentNumber = Number.isFinite(firstInstallmentNumber) ? firstInstallmentNumber : 1;
                if (firstInstallmentNumber < 1 || firstInstallmentNumber > totalInstallments) return { error: 'Informe uma parcela atual valida.' };
                if (!Number.isFinite(installmentAmountInput) || installmentAmountInput <= 0) return { error: 'Informe um valor de parcela valido.' };
                firstInvoiceMonth = normalizeMonthRef(firstInvoiceMonthInput);
                if (!firstInvoiceMonth) return { error: 'Informe o mes da primeira fatura.' };
                installmentAmount = installmentAmountInput;
                totalAmount = installmentAmount * totalInstallments;
            } else {
                if (!purchaseDate) return { error: 'Informe a data da compra.' };
                if (!Number.isFinite(totalAmount) || totalAmount <= 0) return { error: 'Informe um valor valido.' };
                if (type === 'single') totalInstallments = 1;
                firstInstallmentNumber = 1;
                firstInvoiceMonth = getFirstInvoiceMonthForPurchase(card, purchaseDate);
                if (!firstInvoiceMonth) return { error: 'Nao foi possivel calcular a primeira fatura.' };
                installmentAmount = totalAmount / totalInstallments;
            }

            const now = new Date().toISOString();
            return {
                item: {
                    id: Date.now() + Math.random(),
                    cardId: card.id,
                    cardName: card.nome,
                    description,
                    category,
                    responsible,
                    purchaseDate,
                    type,
                    totalAmount,
                    installmentAmount,
                    totalInstallments,
                    firstInstallmentNumber,
                    firstInvoiceMonth,
                    status: 'active',
                    createdAt: now,
                    updatedAt: now
                }
            };
        }

        function addCardItem() {
            const type = document.getElementById('cardItemType')?.value;

            if (type === 'recurring') {
                const recurringResult = buildCardRecurringItemFromForm();
                if (recurringResult.error) return alert(recurringResult.error);

                const recurringItem = recurringResult.item;
                data.cardRecurringItems.push(recurringItem);
                for (let i = 0; i < 12; i++) {
                    createCardInvoiceIfMissing(recurringItem.cardId, addMonthsToMonthRef(recurringItem.startInvoiceMonth, i));
                }

                saveData();
                updateFaturas();
                renderCartoes();
                renderCardRecurringItems();

                document.getElementById('cardItemDescription').value = '';
                document.getElementById('cardItemTotalAmount').value = '';
                const preview = document.getElementById('cardItemPreview');
                if (preview) preview.style.display = 'none';
                updateCardItemForm();

                alert('Recorrente adicionada ao cartao.');
                return;
            }

            const result = buildCardItemFromForm();
            if (result.error) return alert(result.error);

            const item = result.item;
            data.cardItems.push(item);

            const parcelas = generateCardItemInstallmentsPreview(item);
            parcelas.forEach(parcela => createCardInvoiceIfMissing(item.cardId, parcela.invoiceMonth));

            saveData();
            updateFaturas();
            renderCartoes();

            document.getElementById('cardItemDescription').value = '';
            document.getElementById('cardItemTotalAmount').value = '';
            document.getElementById('cardItemTotalInstallments').value = '1';
            document.getElementById('cardItemFirstInstallmentNumber').value = '1';
            document.getElementById('cardItemInstallmentAmount').value = '';
            const preview = document.getElementById('cardItemPreview');
            if (preview) preview.style.display = 'none';
            updateCardItemForm();

            alert('Item adicionado a fatura.');
        }

        function updateCardItemPreview() {
            const preview = document.getElementById('cardItemPreview');
            if (!preview) return;

            if (document.getElementById('cardItemType')?.value === 'recurring') {
                const recurringResult = buildCardRecurringItemFromForm();
                if (recurringResult.error) {
                    preview.style.display = 'none';
                    return;
                }
                const item = recurringResult.item;
                preview.innerHTML = 'Recorrente mensal<br>Valor mensal: ' + formatCurrency(item.amount) + '<br>Inicio: ' + item.startInvoiceMonth + '<br>Aparecera todos os meses ate ser desativada.';
                preview.style.display = 'block';
                return;
            }

            const result = buildCardItemFromForm();
            if (result.error) {
                preview.style.display = 'none';
                return;
            }

            const item = result.item;
            const parcelas = generateCardItemInstallmentsPreview(item);
            if (parcelas.length === 0) {
                preview.style.display = 'none';
                return;
            }

            if (item.type === 'single') {
                preview.innerHTML = 'Compra a vista de ' + formatCurrency(item.totalAmount) + '<br>Fatura: ' + parcelas[0].invoiceMonth;
            } else if (item.type === 'existing_installment') {
                preview.innerHTML = 'Parcela ja em andamento<br>Parcela inicial: ' + item.firstInstallmentNumber + '/' + item.totalInstallments + '<br>Valor da parcela: ' + formatCurrency(item.installmentAmount) + '<br>Primeira fatura: ' + parcelas[0].invoiceMonth + '<br>Ultima fatura: ' + parcelas[parcelas.length - 1].invoiceMonth;
            } else {
                preview.innerHTML = item.totalInstallments + 'x de ' + formatCurrency(item.installmentAmount) + '<br>Primeira fatura: ' + parcelas[0].invoiceMonth + '<br>Ultima fatura: ' + parcelas[parcelas.length - 1].invoiceMonth;
            }
            preview.style.display = 'block';
        }

        function isRecurringItemActiveForMonth(item, monthRef) {
            const start = normalizeMonthRef(item?.startInvoiceMonth);
            const month = normalizeMonthRef(monthRef);
            if (!start || !month) return false;
            if (item.status === 'cancelled') {
                const end = normalizeMonthRef(item.endInvoiceMonth);
                return !!end && month >= start && month <= end;
            }
            return item.status === 'active' && month >= start;
        }

        function getCardRecurringPurchases(cardId, mesRef) {
            return data.cardRecurringItems
                .filter(item => String(item.cardId) === String(cardId))
                .filter(item => isRecurringItemActiveForMonth(item, mesRef))
                .map(item => ({
                    descricao: item.description,
                    parcela: 'Recorrente',
                    valor: Number(item.amount) || 0,
                    responsavel: item.responsible,
                    categoria: item.category,
                    dataCompra: item.startInvoiceMonth + '-01',
                    origem: 'cardRecurringItems',
                    origemLabel: 'Recorrente',
                    recurringItemId: item.id
                }));
        }

        function renderCardRecurringItems() {
            const container = document.getElementById('cardRecurringItemsList');
            if (!container) return;

            if (!data.cardRecurringItems || data.cardRecurringItems.length === 0) {
                container.innerHTML = '<div class="empty-state">Nenhuma recorrente cadastrada.</div>';
                return;
            }

            container.innerHTML = data.cardRecurringItems.map(item => {
                const card = findCardById(item.cardId);
                const status = item.status === 'cancelled' ? 'Cancelada' : 'Ativa';
                const action = item.status === 'active'
                    ? `<button onclick="deactivateCardRecurringItem('${String(item.id)}')" style="margin-top: 8px; background: #e67e22;">Desativar apos mes atual</button>`
                    : '';

                return `
                    <div class="transaction-item">
                        <div>
                            <strong>${item.description}</strong>
                            <div style="font-size: 12px; color: #7f8c8d;">${card ? card.nome : item.cardName || 'Cartao'} - Inicio: ${item.startInvoiceMonth} - ${status}</div>
                        </div>
                        <div style="text-align: right;">
                            <strong>${formatCurrency(Number(item.amount) || 0)}</strong>
                            <div>${action}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function deactivateCardRecurringItem(id) {
            const item = data.cardRecurringItems.find(r => String(r.id) === String(id));
            if (!item) return alert('Recorrente nao encontrada.');
            if (item.status === 'cancelled') return alert('Esta recorrente ja foi desativada.');
            if (!confirm('Desativar esta recorrente apos o mes atual?')) return;

            item.status = 'cancelled';
            item.endInvoiceMonth = new Date().toISOString().slice(0, 7);
            item.cancelledAt = new Date().toISOString();
            item.updatedAt = new Date().toISOString();

            saveData();
            updateFaturas();
            renderCardRecurringItems();
            alert('Recorrente desativada.');
        }

        function getCardInvoicePurchases(cardId, mesRef) {
            const compras = [];

            data.transacoes.forEach(t => {
                if (t.tipo === 'cartao' && String(t.cartaoId) === String(cardId)) {
                    t.parcelas.forEach(p => {
                        if (p.mesReferencia === mesRef) {
                            compras.push({
                                descricao: t.descricao,
                                parcela: p.numero + '/' + t.numParcelas,
                                valor: p.valor,
                                responsavel: t.responsavel,
                                categoria: t.categoria,
                                dataCompra: t.data,
                                origem: 'legacy',
                                origemLabel: 'Compra antiga'
                            });
                        }
                    });
                }
            });

            data.cardItems.forEach(item => {
                if (String(item.cardId) !== String(cardId) || item.status === 'cancelled') return;
                generateCardItemInstallmentsPreview(item).forEach(parcela => {
                    if (parcela.invoiceMonth === mesRef) {
                        compras.push({
                            descricao: item.description,
                            parcela: parcela.installmentNumber + '/' + parcela.totalInstallments,
                            valor: parcela.amount,
                            responsavel: item.responsible,
                            categoria: item.category,
                            dataCompra: item.purchaseDate,
                            origem: 'cardItems',
                            origemLabel: 'Item de fatura'
                        });
                    }
                });
            });

            compras.push(...getCardRecurringPurchases(cardId, mesRef));

            return compras;
        }

        function calcularTotalFaturaPorResponsavel(cardId, mesRef, responsavel) {
            return getCardInvoicePurchases(cardId, mesRef)
                .filter(compra => compra.responsavel === responsavel)
                .reduce((total, compra) => total + compra.valor, 0);
        }

        // ========== FATURAS ==========
        function updateFaturas() {
            const mesRef = document.getElementById('mesReferencia').value;
            if (!mesRef) return;

            const container = document.getElementById('faturasMes');
            if (data.cartoes.length === 0) {
                container.innerHTML = '<div class="empty-state">Cadastre um cartao primeiro</div>';
                return;
            }

            const html = data.cartoes.map(cartao => {
                const invoice = getOrCreateCardInvoice(cartao.id, mesRef);
                const status = invoice?.status || 'aberta';
                const compras = getCardInvoicePurchases(cartao.id, mesRef);
                const subtotaisPorResponsavel = {};

                data.responsaveis.forEach(r => {
                    subtotaisPorResponsavel[r] = 0;
                });
                compras.forEach(compra => {
                    subtotaisPorResponsavel[compra.responsavel] = (subtotaisPorResponsavel[compra.responsavel] || 0) + compra.valor;
                });

                const totalGeral = Object.values(subtotaisPorResponsavel).reduce((a, b) => a + b, 0);
                const valorMeu = subtotaisPorResponsavel['Meu'] || 0;
                const statusActions = `
                    <div style="display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 15px;">
                        <button onclick="updateCardInvoiceStatus('${String(cartao.id)}', '${mesRef}', 'aberta')" style="padding: 8px 12px;">Marcar aberta</button>
                        <button onclick="updateCardInvoiceStatus('${String(cartao.id)}', '${mesRef}', 'fechada')" style="padding: 8px 12px; background: #f39c12;">Marcar fechada</button>
                        <button onclick="updateCardInvoiceStatus('${String(cartao.id)}', '${mesRef}', 'paga')" style="padding: 8px 12px; background: #27ae60;">Marcar paga</button>
                    </div>
                `;
                const paymentInfo = invoice?.paymentTransactionId
                    ? `<div style="font-size: 12px; color: #7f8c8d; margin-top: 6px;">Pagamento vinculado: ${invoice.paymentTransactionId}</div>`
                    : '';

                if (compras.length === 0) {
                    return `
                        <div class="credit-card-box">
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                                <h3>${cartao.nome} - ${mesRef}</h3>
                                ${getInvoiceStatusBadgeHtml(status)}
                            </div>
                            ${statusActions}
                            <p style="opacity: 0.7;">Sem lancamentos neste mes</p>
                            ${paymentInfo}
                        </div>
                    `;
                }

                const responsaveisAtivos = data.responsaveis.filter(r => subtotaisPorResponsavel[r] > 0);
                const linhasTabela = compras.map(c => `
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #ecf0f1;">
                            <div style="font-weight: 600;">${c.descricao} (${c.parcela})</div>
                            <div style="font-size: 11px; color: #7f8c8d;">${c.categoria} - ${c.origemLabel || c.origem || 'Item'}</div>
                        </td>
                        <td style="padding: 10px; border-bottom: 1px solid #ecf0f1;">${c.responsavel}</td>
                        <td style="text-align: right; padding: 10px; border-bottom: 1px solid #ecf0f1;">${formatCurrency(c.valor)}</td>
                    </tr>
                `).join('');

                const subtotaisHTML = responsaveisAtivos.map(r => `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                        <span>${r}</span>
                        <strong>${formatCurrency(subtotaisPorResponsavel[r])}</strong>
                    </div>
                `).join('');

                return `
                    <div class="section" style="margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
                            <div>
                                <h2>${cartao.nome} - ${mesRef}</h2>
                                <div style="font-size: 12px; color: #7f8c8d;">Vencimento: dia ${cartao.diaPagamento}/${mesRef.split('-')[1]}</div>
                                ${paymentInfo}
                            </div>
                            <div style="text-align: right;">
                                ${getInvoiceStatusBadgeHtml(status)}
                                <div style="font-size: 20px; font-weight: 700; color: #e74c3c; margin-top: 6px;">${formatCurrency(totalGeral)}</div>
                            </div>
                        </div>

                        ${statusActions}

                        <div style="overflow-x: auto;">
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                                <thead>
                                    <tr>
                                        <th style="width: 60%; text-align: left; padding: 10px; background: #667eea; color: white;">Descricao</th>
                                        <th style="text-align: left; padding: 10px; background: #667eea; color: white;">Responsavel</th>
                                        <th style="text-align: right; padding: 10px; background: #667eea; color: white;">Valor</th>
                                    </tr>
                                </thead>
                                <tbody>${linhasTabela}</tbody>
                            </table>
                        </div>

                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #667eea;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span>Total Geral da Fatura:</span>
                                <strong style="color: #e74c3c;">${formatCurrency(totalGeral)}</strong>
                            </div>
                            ${subtotaisHTML}
                            <div style="display: flex; justify-content: space-between; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 10px;">
                                <span>Valor Meu para o orcamento:</span>
                                <strong style="color: #27ae60;">${formatCurrency(valorMeu)}</strong>
                            </div>
                            ${status === 'paga' ? '<div style="font-size: 12px; color: #27ae60; margin-top: 8px;">Fatura marcada como paga.</div>' : ''}
                        </div>

                        <button onclick="gerarLancamentoPagamentoFatura('${String(cartao.id)}', '${mesRef}')" style="margin-top: 15px; background: #27ae60;">
                            Gerar Lancamento de Pagamento (${formatCurrency(valorMeu)})
                        </button>
                    </div>
                `;
            }).join('');

            container.innerHTML = html;
        }
        // Gerar lançamento de pagamento da fatura
        function getInvoicePaymentAmount(cardId, mesRef) {
    const amount = calcularTotalFaturaPorResponsavel(cardId, mesRef, 'Meu');
    return Number(amount) || 0;
}

function findInvoicePaymentTransaction(invoice) {
    if (!invoice) return null;

    if (invoice.paymentTransactionId) {
        const byId = data.transacoes.find(t => String(t.id) === String(invoice.paymentTransactionId));
        if (byId) return byId;
    }

    const byInvoiceId = data.transacoes.find(t =>
        t.tipo === 'dinheiro' &&
        t.origem === 'fatura' &&
        t.invoiceId &&
        String(t.invoiceId) === String(invoice.id)
    );
    if (byInvoiceId) return byInvoiceId;

    const byCardAndMonth = data.transacoes.find(t =>
        t.tipo === 'dinheiro' &&
        t.origem === 'fatura' &&
        t.cardId &&
        String(t.cardId) === String(invoice.cardId) &&
        t.invoiceMonth === invoice.monthRef
    );
    if (byCardAndMonth) return byCardAndMonth;

    const card = findCardById(invoice.cardId);
    if (card) {
        const dueDate = getInvoicePaymentDueDate(card, invoice.monthRef);

        const byLegacyDescriptionAndDate = data.transacoes.find(t => {
            const plannedDate = getTransactionPlannedDate(t) || t.data;
            return (
                t.tipo === 'dinheiro' &&
                t.origem === 'fatura' &&
                String(t.descricao || '').includes('Pagamento Fatura') &&
                plannedDate === dueDate
            );
        });

        if (byLegacyDescriptionAndDate) return byLegacyDescriptionAndDate;
    }

    return null;
}

function getInvoicePaymentDueDate(card, mesRef) {
    const normalizedMonth = normalizeMonthRef(mesRef);
    if (!card || !normalizedMonth) return getTodayDateString();

    const [year, month] = normalizedMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const paymentDay = Math.min(Number(card.diaPagamento) || lastDay, lastDay);

    return `${year}-${String(month).padStart(2, '0')}-${String(paymentDay).padStart(2, '0')}`;
}

function createInvoicePaymentTransaction(card, invoice, amount) {
    const now = new Date().toISOString();
    const dueDate = getInvoicePaymentDueDate(card, invoice.monthRef);
    const numericAmount = Number(amount) || 0;

    return {
        id: Date.now() + Math.random(),
        tipo: 'dinheiro',
        subTipo: 'saida',
        data: dueDate,
        valor: numericAmount,
        categoria: 'Fatura Cartão',
        responsavel: 'Meu',
        descricao: `Pagamento Fatura ${card.nome}`,
        recorrente: false,
        realizado: false,

        accountId: 'conta-principal',
        dataPrevista: dueDate,
        valorPrevisto: numericAmount,
        status: 'previsto',
        dataRealizada: null,
        valorRealizado: null,
        confirmedAt: null,
        origem: 'fatura',
        invoiceId: invoice.id,
        cardId: card.id,
        invoiceMonth: invoice.monthRef,
        observacao: '',
        createdAt: now,
        updatedAt: now
    };
}

function ensureInvoicePaymentTransaction(cardId, mesRef, options = {}) {
    const silent = Boolean(options && options.silent);
    const card = findCardById(cardId);

    if (!card) {
        if (!silent) alert('Cartão não encontrado.');
        return null;
    }

    const monthRef = normalizeMonthRef(mesRef);
    if (!monthRef) {
        if (!silent) alert('Mês da fatura inválido.');
        return null;
    }

    const invoice = getOrCreateCardInvoice(card.id, monthRef);
    const amount = getInvoicePaymentAmount(card.id, monthRef);
    const now = new Date().toISOString();

    let existing = findInvoicePaymentTransaction(invoice);

    if (amount <= 0) {
        if (!silent) alert('Não há valor Meu para gerar pagamento.');
        return existing || null;
    }

    if (invoice.status === 'paga') {
        if (!silent) alert('A fatura já está marcada como paga.');
        return existing || null;
    }

    if (!existing) {
        const transaction = createInvoicePaymentTransaction(card, invoice, amount);

        data.transacoes.push(transaction);
        invoice.paymentTransactionId = transaction.id;
        invoice.updatedAt = now;

        saveData();

        if (!silent) alert('Pagamento da fatura criado.');
        return transaction;
    }

    let changed = false;

    if (existing.invoiceId !== invoice.id) {
        existing.invoiceId = invoice.id;
        changed = true;
    }

    if (String(existing.cardId) !== String(card.id)) {
        existing.cardId = card.id;
        changed = true;
    }

    if (existing.invoiceMonth !== invoice.monthRef) {
        existing.invoiceMonth = invoice.monthRef;
        changed = true;
    }

    if (String(invoice.paymentTransactionId) !== String(existing.id)) {
        invoice.paymentTransactionId = existing.id;
        changed = true;
    }

    const existingStatus = getDerivedStatus(existing);

    if (existingStatus === 'confirmado' || existing.realizado === true) {
        if (changed) {
            existing.updatedAt = now;
            invoice.updatedAt = now;
            saveData();
        }

        if (!silent) {
            alert('O pagamento desta fatura já foi confirmado. O valor não foi alterado.');
        }

        return existing;
    }

    const dueDate = getInvoicePaymentDueDate(card, invoice.monthRef);

    if (Number(existing.valor) !== Number(amount)) {
        existing.valor = amount;
        changed = true;
    }

    if (Number(existing.valorPrevisto) !== Number(amount)) {
        existing.valorPrevisto = amount;
        changed = true;
    }

    if (existing.data !== dueDate) {
        existing.data = dueDate;
        changed = true;
    }

    if (existing.dataPrevista !== dueDate) {
        existing.dataPrevista = dueDate;
        changed = true;
    }

    if (!existing.status || existingStatus === 'atrasado') {
        existing.status = 'previsto';
        changed = true;
    }

    if (existing.realizado !== false) {
        existing.realizado = false;
        changed = true;
    }

    if (changed) {
        existing.updatedAt = now;
        invoice.updatedAt = now;
        saveData();
    }

    if (!silent) {
        alert(changed ? 'Pagamento da fatura atualizado.' : 'Pagamento da fatura já está atualizado.');
    }

    return existing;
}

function gerarLancamentoPagamentoFatura(cartaoId, mesRef) {
    const transaction = ensureInvoicePaymentTransaction(cartaoId, mesRef, { silent: false });

    updateFaturas();
    updateSemanal();

    if (document.getElementById('todasTransacoes')) {
        renderTodasTransacoes();
    }

    return transaction;
}

        // ========== SIMULADOR ==========
        function simular() {
            const cartaoId = parseInt(document.getElementById('simCartao').value);
            const valor = parseFloat(document.getElementById('simValor').value);
            const dataCompra = document.getElementById('simData').value;
            const opcoesStr = document.getElementById('simOpcoes').value;

            if (!cartaoId || !valor || !dataCompra || !opcoesStr) {
                return alert('Preencha todos os campos!');
            }

            const cartao = data.cartoes.find(c => String(c.id) === String(cartaoId));
            const opcoes = opcoesStr.split(',').map(o => parseInt(o.trim())).filter(o => o > 0);

            if (opcoes.length === 0) {
                return alert('Digite opções válidas de parcelamento!');
            }

            const container = document.getElementById('simResultados');
            
            const html = opcoes.map(numParcelas => {
                const parcelas = gerarParcelas(dataCompra, valor, numParcelas, cartao);
                const valorParcela = valor / numParcelas;

                const porMes = {};
                parcelas.forEach(p => {
                    if (!porMes[p.mesReferencia]) {
                        porMes[p.mesReferencia] = 0;
                    }
                    porMes[p.mesReferencia] += p.valor;
                });

                const mesesHTML = Object.entries(porMes).map(([mes, total]) => `
                    <div style="background: #f8f9fa; padding: 10px; border-radius: 6px; margin-bottom: 8px;">
                        <strong>${mes}</strong>: ${formatCurrency(total)}
                    </div>
                `).join('');

                return `
                    <div class="simulator-option">
                        <h3>${numParcelas}x de ${formatCurrency(valorParcela)}</h3>
                        <div style="display: flex; justify-content: space-between; margin: 10px 0; font-size: 14px;">
                            <span>Total:</span>
                            <strong>${formatCurrency(valor)}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
                            <span>Primeira parcela:</span>
                            <span>${parcelas[0].mesReferencia}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; font-size: 14px;">
                            <span>Última parcela:</span>
                            <span>${parcelas[numParcelas - 1].mesReferencia}</span>
                        </div>
                        <div style="border-top: 1px solid #ecf0f1; padding-top: 15px;">
                            <strong style="font-size: 12px; color: #7f8c8d;">IMPACTO NAS FATURAS:</strong>
                            <div style="margin-top: 10px;">
                                ${mesesHTML}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = html;
        }

        // ========== ATUALIZAR SELECTS ==========
        function updateAllSelects() {
            const categoriasHTML = data.categorias.map(c => `<option value="${c}">${c}</option>`).join('');
            const responsaveisHTML = data.responsaveis.map(r => `<option value="${r}">${r}</option>`).join('');
            const cartoesHTML = data.cartoes.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');

            ['dinheiroCategoria', 'cartaoCategoria', 'cardItemCategory'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = categoriasHTML;
            });

            ['dinheiroResponsavel', 'cartaoResponsavel', 'cardItemResponsible'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = responsaveisHTML;
            });

            ['cartaoSelect', 'simCartao', 'cardItemCardId'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = cartoesHTML || '<option value="">Cadastre um cartão primeiro</option>';
            });
        }


        ['cardItemCardId', 'cardItemPurchaseDate', 'cardItemDescription', 'cardItemTotalAmount', 'cardItemTotalInstallments', 'cardItemFirstInstallmentNumber', 'cardItemFirstInvoiceMonth', 'cardItemInstallmentAmount', 'cardItemCategory', 'cardItemResponsible'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', updateCardItemPreview);
            document.getElementById(id)?.addEventListener('change', updateCardItemPreview);
        });
        document.getElementById('cardItemType')?.addEventListener('change', updateCardItemForm);

        // ========== INICIAR ==========
        
function runDataHealthCheck() {
    const issues = [];
    const warnings = [];

    const report = {
        generatedAt: new Date().toISOString(),
        schemaVersion: data.schemaVersion || null,
        stats: {
            accounts: Array.isArray(data.accounts) ? data.accounts.length : 0,
            categorias: Array.isArray(data.categorias) ? data.categorias.length : 0,
            responsaveis: Array.isArray(data.responsaveis) ? data.responsaveis.length : 0,
            cartoes: Array.isArray(data.cartoes) ? data.cartoes.length : 0,
            transacoes: Array.isArray(data.transacoes) ? data.transacoes.length : 0,
            cardItems: Array.isArray(data.cardItems) ? data.cardItems.length : 0,
            cardRecurringItems: Array.isArray(data.cardRecurringItems) ? data.cardRecurringItems.length : 0,
            cardInvoices: Array.isArray(data.cardInvoices) ? data.cardInvoices.length : 0
        },
        issues,
        warnings
    };

    if (!data || typeof data !== 'object') {
        issues.push('Objeto principal de dados inválido.');
        return report;
    }

    if (!data.schemaVersion) {
        warnings.push('schemaVersion ausente. A migração pode não ter rodado.');
    }

    if (!Array.isArray(data.accounts) || data.accounts.length === 0) {
        warnings.push('Nenhuma conta cadastrada em data.accounts.');
    }

    if (!Array.isArray(data.transacoes)) {
        issues.push('data.transacoes não é um array.');
    } else {
        data.transacoes.forEach((t, index) => {
            const label = t.descricao || t.description || t.id || `transacao_${index}`;

            if (!t.id) warnings.push(`Transação sem id: ${label}`);

            if (t.tipo === 'dinheiro') {
                if (!t.status) warnings.push(`Transação de dinheiro sem status: ${label}`);
                if (!t.dataPrevista && !t.data) warnings.push(`Transação de dinheiro sem data prevista: ${label}`);
                if (t.valorPrevisto === undefined && t.valor === undefined) warnings.push(`Transação de dinheiro sem valor previsto: ${label}`);

                const status = getDerivedStatus(t);
                if (status === 'confirmado') {
                    if (!t.dataRealizada) warnings.push(`Confirmada sem dataRealizada: ${label}`);
                    if (t.valorRealizado === undefined || t.valorRealizado === null) warnings.push(`Confirmada sem valorRealizado: ${label}`);
                }

                if (t.origem === 'fatura') {
                    if (!t.invoiceId) warnings.push(`Pagamento de fatura sem invoiceId: ${label}`);
                    if (!t.cardId) warnings.push(`Pagamento de fatura sem cardId: ${label}`);
                    if (!t.invoiceMonth) warnings.push(`Pagamento de fatura sem invoiceMonth: ${label}`);
                }
            }

            if (t.tipo === 'cartao') {
                if (!Array.isArray(t.parcelas)) warnings.push(`Compra antiga de cartão sem parcelas: ${label}`);
            }
        });
    }

    if (!Array.isArray(data.cardItems)) {
        issues.push('data.cardItems não é um array.');
    } else {
        data.cardItems.forEach((item, index) => {
            const label = item.description || item.id || `cardItem_${index}`;

            if (!item.id) warnings.push(`cardItem sem id: ${label}`);
            if (!item.cardId) warnings.push(`cardItem sem cardId: ${label}`);
            if (!item.type) warnings.push(`cardItem sem type: ${label}`);
            if (!item.firstInvoiceMonth && item.type !== 'single') warnings.push(`cardItem sem firstInvoiceMonth: ${label}`);

            const preview = generateCardItemInstallmentsPreview(item);
            if (item.status !== 'cancelled' && item.type !== 'recurring' && preview.length === 0) {
                warnings.push(`cardItem ativo sem parcelas projetadas: ${label}`);
            }
        });
    }

    if (!Array.isArray(data.cardRecurringItems)) {
        issues.push('data.cardRecurringItems não é um array.');
    } else {
        data.cardRecurringItems.forEach((item, index) => {
            const label = item.description || item.id || `recorrente_${index}`;

            if (!item.id) warnings.push(`Recorrente sem id: ${label}`);
            if (!item.cardId) warnings.push(`Recorrente sem cardId: ${label}`);
            if (!item.startInvoiceMonth) warnings.push(`Recorrente sem mês inicial: ${label}`);
            if (!item.status) warnings.push(`Recorrente sem status: ${label}`);

            if (item.status === 'cancelled' && !item.endInvoiceMonth) {
                warnings.push(`Recorrente cancelada sem endInvoiceMonth: ${label}`);
            }
        });
    }

    if (!Array.isArray(data.cardInvoices)) {
        issues.push('data.cardInvoices não é um array.');
    } else {
        const validStatuses = ['aberta', 'fechada', 'paga'];

        data.cardInvoices.forEach((invoice, index) => {
            const label = invoice.id || `invoice_${index}`;

            if (!invoice.id) warnings.push(`Fatura sem id: ${label}`);
            if (!invoice.cardId) warnings.push(`Fatura sem cardId: ${label}`);
            if (!invoice.monthRef) warnings.push(`Fatura sem monthRef: ${label}`);
            if (!validStatuses.includes(invoice.status)) warnings.push(`Fatura com status inválido: ${label}`);

            if (invoice.status === 'paga' && !invoice.paidAt) {
                warnings.push(`Fatura marcada como paga sem paidAt: ${label}`);
            }
        });
    }

    const paymentGroups = {};
    if (Array.isArray(data.transacoes)) {
        data.transacoes
            .filter(t => t.tipo === 'dinheiro' && t.origem === 'fatura')
            .forEach(t => {
                const key = t.invoiceId || (t.cardId && t.invoiceMonth ? `${t.cardId}_${t.invoiceMonth}` : null);
                if (!key) return;
                if (!paymentGroups[key]) paymentGroups[key] = [];
                paymentGroups[key].push(t);
            });
    }

    Object.entries(paymentGroups).forEach(([key, transactions]) => {
        if (transactions.length > 1) {
            warnings.push(`Possível duplicidade de pagamento de fatura para ${key}: ${transactions.length} lançamentos.`);
        }
    });

    return report;
}

function formatDataHealthReport(report) {
    const lines = [];

    lines.push('Diagnóstico dos dados');
    lines.push('');
    lines.push(`Schema: ${report.schemaVersion || 'não informado'}`);
    lines.push(`Gerado em: ${report.generatedAt}`);
    lines.push('');
    lines.push('Resumo:');
    lines.push(`- Contas: ${report.stats.accounts}`);
    lines.push(`- Cartões: ${report.stats.cartoes}`);
    lines.push(`- Transações: ${report.stats.transacoes}`);
    lines.push(`- Itens de fatura: ${report.stats.cardItems}`);
    lines.push(`- Recorrentes: ${report.stats.cardRecurringItems}`);
    lines.push(`- Faturas: ${report.stats.cardInvoices}`);
    lines.push('');

    if (report.issues.length === 0 && report.warnings.length === 0) {
        lines.push('Nenhum problema encontrado nos principais dados.');
        return lines.join('\n');
    }

    if (report.issues.length > 0) {
        lines.push(`Problemas críticos: ${report.issues.length}`);
        report.issues.slice(0, 8).forEach(item => lines.push(`- ${item}`));
        if (report.issues.length > 8) lines.push(`... e mais ${report.issues.length - 8}`);
        lines.push('');
    }

    if (report.warnings.length > 0) {
        lines.push(`Avisos: ${report.warnings.length}`);
        report.warnings.slice(0, 12).forEach(item => lines.push(`- ${item}`));
        if (report.warnings.length > 12) lines.push(`... e mais ${report.warnings.length - 12}`);
    }

    return lines.join('\n');
}

function showDataHealthCheck() {
    const report = runDataHealthCheck();

    console.group('Diagnóstico dos dados financeiros');
    console.log(report);
    if (report.issues.length) console.table(report.issues);
    if (report.warnings.length) console.table(report.warnings);
    console.groupEnd();

    alert(formatDataHealthReport(report));
}

function createManualBackupFromUI() {
    try {
        const beforeKeys = Object.keys(localStorage).filter(key => key.startsWith('financeDataV2_backup_')).length;
        const result = createManualBackup();
        const afterKeys = Object.keys(localStorage).filter(key => key.startsWith('financeDataV2_backup_')).length;

        if (result === false || afterKeys <= beforeKeys) {
            alert('Nenhum dado salvo encontrado para criar backup.');
            return;
        }

        alert('Backup manual criado com sucesso no navegador.');
    } catch (error) {
        console.error('Erro ao criar backup manual:', error);
        alert('Erro ao criar backup manual. Veja o console.');
    }
}



function getMonthDiffFromNow(dateStr) {
    if (!dateStr) return null;

    const date = new Date(dateStr + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return null;

    const now = new Date();
    return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

function calculateAverageConfirmedMonthlyExpenses(monthsBack = 3) {
    if (!Array.isArray(data.transacoes)) return 0;

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
    start.setHours(0, 0, 0, 0);

    let total = 0;
    const countedMonths = new Set();

    data.transacoes.forEach(t => {
        if (t.tipo !== 'dinheiro') return;
        if (t.subTipo !== 'saida') return;
        if (isBalanceAdjustmentTransaction(t)) return;
        if (t.origem === 'fatura') return;

        const status = getDerivedStatus(t);
        if (status !== 'confirmado') return;

        const dateStr = getTransactionActualDate(t) || getTransactionPlannedDate(t);
        if (!dateStr) return;

        const date = new Date(dateStr + 'T12:00:00');
        if (Number.isNaN(date.getTime())) return;
        if (date < start || date > now) return;

        total += getTransactionActualValue(t);
        countedMonths.add(date.toISOString().slice(0, 7));
    });

    const divisor = Math.max(1, countedMonths.size || monthsBack);
    return total / divisor;
}

function calculateAverageConfirmedMonthlyMarketExpenses(monthsBack = 3) {
    if (!Array.isArray(data.transacoes)) return 0;

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 1);
    start.setHours(0, 0, 0, 0);

    let total = 0;
    const countedMonths = new Set();

    data.transacoes.forEach(t => {
        if (t.tipo !== 'dinheiro') return;
        if (t.subTipo !== 'saida') return;
        if (isBalanceAdjustmentTransaction(t)) return;

        const category = String(t.categoria || '');
        if (!category.startsWith('Mercado')) return;

        const status = getDerivedStatus(t);
        if (status !== 'confirmado') return;

        const dateStr = getTransactionActualDate(t) || getTransactionPlannedDate(t);
        if (!dateStr) return;

        const date = new Date(dateStr + 'T12:00:00');
        if (Number.isNaN(date.getTime())) return;
        if (date < start || date > now) return;

        total += getTransactionActualValue(t);
        countedMonths.add(date.toISOString().slice(0, 7));
    });

    const divisor = Math.max(1, countedMonths.size || monthsBack);
    return total / divisor;
}

function calculateAverageFutureCardInvoices(monthsAhead = 3) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    let total = 0;
    let counted = 0;

    for (let i = 0; i < monthsAhead; i++) {
        const monthRef = addMonthsToMonthRef(currentMonth, i);
        const amount = getAllCardInvoicesAmountForMonth(monthRef);

        total += amount;
        counted++;
    }

    return counted > 0 ? total / counted : 0;
}

function setDecisionFieldValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;

    if (typeof value === 'number') {
        el.value = Number(value || 0).toFixed(2);
        return;
    }

    el.value = value ?? '';
}

function prefillDecisionSimulatorFromApp() {
    const averageExpenses = calculateAverageConfirmedMonthlyExpenses(3);
    const averageMarket = calculateAverageConfirmedMonthlyMarketExpenses(3);
    const averageCardInvoices = calculateAverageFutureCardInvoices(3);

    const suggestedVariable = averageMarket > 0 ? averageMarket : 0;
    const suggestedEssential = Math.max(0, averageExpenses - suggestedVariable);

    setDecisionFieldValue('decisionStartMonth', new Date().toISOString().slice(0, 7));
    setDecisionFieldValue('decisionCurrentBalance', Number(data.saldoAtual || 0));
    setDecisionFieldValue('decisionMinimumBalance', Number(data.fundoEmergencia || 0));

    if (!getDecisionFieldValue('decisionMonths')) {
        setDecisionFieldValue('decisionMonths', 12);
    }

    if (!getDecisionFieldValue('decisionSeveranceMonths')) {
        setDecisionFieldValue('decisionSeveranceMonths', 12);
    }

    setDecisionFieldValue('decisionEssentialExpenses', suggestedEssential);
    setDecisionFieldValue('decisionVariableExpenses', suggestedVariable);

    const includeCardInvoices = document.getElementById('decisionIncludeCardInvoices');
    if (includeCardInvoices) includeCardInvoices.checked = true;

    const message = [
        'Dados preenchidos com base no app:',
        '',
        'Saldo atual: ' + formatCurrency(Number(data.saldoAtual || 0)),
        'Saldo mínimo: ' + formatCurrency(Number(data.fundoEmergencia || 0)),
        'Média de despesas confirmadas: ' + formatCurrency(averageExpenses),
        'Média de mercado: ' + formatCurrency(averageMarket),
        'Média de faturas futuras: ' + formatCurrency(averageCardInvoices),
        '',
        'Atenção: revise os valores antes de decidir.'
    ].join('\n');

    alert(message);
}


function initializeDecisionSimulator() {
    const startMonth = document.getElementById('decisionStartMonth');
    if (startMonth && !startMonth.value) {
        startMonth.value = new Date().toISOString().slice(0, 7);
    }

    const currentBalance = document.getElementById('decisionCurrentBalance');
    if (currentBalance && !currentBalance.value) {
        currentBalance.value = Number(data.saldoAtual || 0).toFixed(2);
    }

    const minimumBalance = document.getElementById('decisionMinimumBalance');
    if (minimumBalance && !minimumBalance.value) {
        minimumBalance.value = Number(data.fundoEmergencia || 0).toFixed(2);
    }

    renderDecisionScenarios();
}

function parseDecisionNumber(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return 0;
    const value = parseCurrencyInput(el.value || '0');
    return Number.isFinite(value) ? value : 0;
}

function getDecisionFieldValue(elementId) {
    const el = document.getElementById(elementId);
    return el ? String(el.value || '').trim() : '';
}

function getAllCardInvoicesAmountForMonth(monthRef) {
    if (!Array.isArray(data.cartoes)) return 0;

    return data.cartoes.reduce((total, card) => {
        return total + (Number(calcularTotalFaturaPorResponsavel(card.id, monthRef, 'Meu')) || 0);
    }, 0);
}

function buildDecisionScenarioFromForm() {
    const name = getDecisionFieldValue('decisionScenarioName') || 'Cenário sem nome';
    const startMonth = normalizeMonthRef(getDecisionFieldValue('decisionStartMonth'));
    const months = parseInt(getDecisionFieldValue('decisionMonths'), 10) || 12;

    if (!startMonth) {
        alert('Informe o mês inicial do cenário.');
        return null;
    }

    if (months < 1 || months > 36) {
        alert('Informe uma quantidade de meses entre 1 e 36.');
        return null;
    }

    const includeCardInvoicesEl = document.getElementById('decisionIncludeCardInvoices');

    return {
        id: Date.now() + Math.random(),
        name,
        startMonth,
        months,
        currentBalance: parseDecisionNumber('decisionCurrentBalance'),
        severanceTotal: parseDecisionNumber('decisionSeveranceTotal'),
        severanceMonths: Math.max(1, parseInt(getDecisionFieldValue('decisionSeveranceMonths'), 10) || 1),
        lostMonthlyIncome: parseDecisionNumber('decisionLostMonthlyIncome'),
        continuingIncome: parseDecisionNumber('decisionContinuingIncome'),
        extraIncome: parseDecisionNumber('decisionExtraIncome'),
        essentialExpenses: parseDecisionNumber('decisionEssentialExpenses'),
        variableExpenses: parseDecisionNumber('decisionVariableExpenses'),
        minimumBalance: parseDecisionNumber('decisionMinimumBalance'),
        includeCardInvoices: includeCardInvoicesEl ? includeCardInvoicesEl.checked : true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
}

function calculateDecisionScenario(scenario) {
    const rows = [];
    let balance = Number(scenario.currentBalance) || 0;
    let firstDangerMonth = null;
    let lowestBalance = balance;
    let maxMonthlyGap = 0;
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalCardInvoices = 0;
    let totalSeverance = 0;
    let totalExtraIncome = 0;
    let totalContinuingIncome = 0;

    const minimumBalance = Number(scenario.minimumBalance) || 0;

    for (let i = 0; i < scenario.months; i++) {
        const monthRef = addMonthsToMonthRef(scenario.startMonth, i);

        const severanceMonthly =
            i < scenario.severanceMonths
                ? (Number(scenario.severanceTotal) || 0) / scenario.severanceMonths
                : 0;

        const continuingIncome = Number(scenario.continuingIncome) || 0;
        const extraIncome = Number(scenario.extraIncome) || 0;
        const lostMonthlyIncome = Number(scenario.lostMonthlyIncome) || 0;
        const cardInvoices = scenario.includeCardInvoices ? getAllCardInvoicesAmountForMonth(monthRef) : 0;

        const essentialExpenses = Number(scenario.essentialExpenses) || 0;
        const variableExpenses = Number(scenario.variableExpenses) || 0;

        const income = continuingIncome + extraIncome + severanceMonthly;
        const expenses = essentialExpenses + variableExpenses + cardInvoices;

        const result = income - expenses;
        const openingBalance = balance;

        balance += result;

        const requiredExtraIncomeToBreakEven = Math.max(0, expenses - (continuingIncome + severanceMonthly));
        const requiredExtraIncomeToProtectMinimum = Math.max(0, minimumBalance - balance);
        const incomeReplacementGap = Math.max(0, lostMonthlyIncome - extraIncome);

        totalIncome += income;
        totalExpenses += expenses;
        totalCardInvoices += cardInvoices;
        totalSeverance += severanceMonthly;
        totalExtraIncome += extraIncome;
        totalContinuingIncome += continuingIncome;

        if (balance < lowestBalance) lowestBalance = balance;

        if (result < 0) {
            maxMonthlyGap = Math.max(maxMonthlyGap, Math.abs(result));
        }

        if (!firstDangerMonth && balance < minimumBalance) {
            firstDangerMonth = monthRef;
        }

        rows.push({
            monthRef,
            openingBalance,
            severanceMonthly,
            continuingIncome,
            extraIncome,
            lostMonthlyIncome,
            income,
            essentialExpenses,
            variableExpenses,
            cardInvoices,
            expenses,
            result,
            closingBalance: balance,
            requiredExtraIncomeToBreakEven,
            requiredExtraIncomeToProtectMinimum,
            incomeReplacementGap,
            isDanger: balance < minimumBalance
        });
    }

    const monthsUntilDanger = firstDangerMonth
        ? rows.findIndex(row => row.monthRef === firstDangerMonth) + 1
        : null;

    const recommendedMonthlyIncome = Math.max(
        maxMonthlyGap,
        ...rows.map(row => row.requiredExtraIncomeToBreakEven || 0)
    );

    return {
        scenario,
        rows,
        finalBalance: balance,
        lowestBalance,
        firstDangerMonth,
        monthsUntilDanger,
        maxMonthlyGap,
        recommendedMonthlyIncome,
        totalIncome,
        totalExpenses,
        totalCardInvoices,
        totalSeverance,
        totalExtraIncome,
        totalContinuingIncome
    };
}

function renderDecisionSimulation(result) {
    const container = document.getElementById('decisionSimulatorResults');
    if (!container || !result) return;

    const rows = result.rows || [];
    const scenario = result.scenario;
    const minimumBalance = Number(scenario.minimumBalance) || 0;

    const summaryClass = result.finalBalance >= minimumBalance ? 'alert-success' : 'alert-warning';

    const decisionText = result.firstDangerMonth
        ? `Atenção: neste cenário, o saldo fica abaixo do mínimo em <strong>${result.firstDangerMonth}</strong>.`
        : 'Neste cenário, o saldo não cai abaixo do mínimo definido.';

    const summary = `
        <div class="alert ${summaryClass}">
            <strong>Resultado do cenário: ${scenario.name}</strong><br>
            ${decisionText}<br><br>
            Saldo final projetado: <strong>${formatCurrency(result.finalBalance)}</strong><br>
            Menor saldo no período: <strong>${formatCurrency(result.lowestBalance)}</strong><br>
            Saldo mínimo de segurança: <strong>${formatCurrency(minimumBalance)}</strong><br>
            ${result.monthsUntilDanger ? `Meses até alerta: <strong>${result.monthsUntilDanger}</strong><br>` : ''}
            Maior déficit mensal: <strong>${formatCurrency(result.maxMonthlyGap)}</strong><br>
            Renda mensal sugerida para equilibrar o pior mês: <strong>${formatCurrency(result.recommendedMonthlyIncome)}</strong>
        </div>

        <div class="dashboard-cards">
            <div class="card">
                <h3>Total de Entradas</h3>
                <div class="value positive">${formatCurrency(result.totalIncome)}</div>
                <div class="subtext">No período simulado</div>
            </div>
            <div class="card">
                <h3>Total de Saídas</h3>
                <div class="value negative">${formatCurrency(result.totalExpenses)}</div>
                <div class="subtext">Incluindo faturas se marcado</div>
            </div>
            <div class="card">
                <h3>Faturas no Período</h3>
                <div class="value warning">${formatCurrency(result.totalCardInvoices)}</div>
                <div class="subtext">Responsável Meu</div>
            </div>
            <div class="card">
                <h3>Valor Parcelado Recebido</h3>
                <div class="value positive">${formatCurrency(result.totalSeverance)}</div>
                <div class="subtext">Distribuído no cenário</div>
            </div>
        </div>
    `;

    const tableRows = rows.map(row => `
        <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ecf0f1;">${row.monthRef}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ecf0f1; text-align:right;">${formatCurrency(row.openingBalance)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ecf0f1; text-align:right; color:#27ae60;">
                ${formatCurrency(row.income)}
                <div style="font-size:11px; color:#7f8c8d;">
                    Renda: ${formatCurrency(row.continuingIncome)} · Parcela: ${formatCurrency(row.severanceMonthly)} · Extra: ${formatCurrency(row.extraIncome)}
                </div>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #ecf0f1; text-align:right; color:#e74c3c;">
                ${formatCurrency(row.expenses)}
                <div style="font-size:11px; color:#7f8c8d;">
                    Essenciais: ${formatCurrency(row.essentialExpenses)} · Variáveis: ${formatCurrency(row.variableExpenses)} · Faturas: ${formatCurrency(row.cardInvoices)}
                </div>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #ecf0f1; text-align:right; color:${row.result >= 0 ? '#27ae60' : '#e74c3c'};">${formatCurrency(row.result)}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ecf0f1; text-align:right;">
                ${formatCurrency(row.requiredExtraIncomeToBreakEven)}
                <div style="font-size:11px; color:#7f8c8d;">para equilibrar o mês</div>
            </td>
            <td style="padding: 8px; border-bottom: 1px solid #ecf0f1; text-align:right; color:${row.isDanger ? '#e74c3c' : '#2c3e50'};">${formatCurrency(row.closingBalance)}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        ${summary}
        <div style="overflow-x:auto;">
            <table style="width:100%; background:white;">
                <thead>
                    <tr>
                        <th style="text-align:left; padding: 8px; background:#f8f9fa;">Mês</th>
                        <th style="text-align:right; padding: 8px; background:#f8f9fa;">Saldo Inicial</th>
                        <th style="text-align:right; padding: 8px; background:#f8f9fa;">Entradas</th>
                        <th style="text-align:right; padding: 8px; background:#f8f9fa;">Saídas</th>
                        <th style="text-align:right; padding: 8px; background:#f8f9fa;">Resultado</th>
                        <th style="text-align:right; padding: 8px; background:#f8f9fa;">Renda Necessária</th>
                        <th style="text-align:right; padding: 8px; background:#f8f9fa;">Saldo Final</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;
}

function runDecisionSimulation() {
    const scenario = buildDecisionScenarioFromForm();
    if (!scenario) return null;

    const result = calculateDecisionScenario(scenario);
    renderDecisionSimulation(result);

    return result;
}

function saveDecisionScenario() {
    const scenario = buildDecisionScenarioFromForm();
    if (!scenario) return;

    if (!Array.isArray(data.decisionScenarios)) {
        data.decisionScenarios = [];
    }

    data.decisionScenarios.push(scenario);
    saveData();
    renderDecisionScenarios();

    const result = calculateDecisionScenario(scenario);
    renderDecisionSimulation(result);

    alert('Cenário salvo com sucesso.');
}

function loadDecisionScenario(id) {
    const scenario = (data.decisionScenarios || []).find(item => String(item.id) === String(id));

    if (!scenario) {
        alert('Cenário não encontrado.');
        return;
    }

    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value ?? '';
    };

    setValue('decisionScenarioName', scenario.name);
    setValue('decisionStartMonth', scenario.startMonth);
    setValue('decisionMonths', scenario.months);
    setValue('decisionCurrentBalance', scenario.currentBalance);
    setValue('decisionSeveranceTotal', scenario.severanceTotal);
    setValue('decisionSeveranceMonths', scenario.severanceMonths);
    setValue('decisionLostMonthlyIncome', scenario.lostMonthlyIncome);
    setValue('decisionContinuingIncome', scenario.continuingIncome);
    setValue('decisionExtraIncome', scenario.extraIncome);
    setValue('decisionEssentialExpenses', scenario.essentialExpenses);
    setValue('decisionVariableExpenses', scenario.variableExpenses);
    setValue('decisionMinimumBalance', scenario.minimumBalance);

    const includeCardInvoices = document.getElementById('decisionIncludeCardInvoices');
    if (includeCardInvoices) includeCardInvoices.checked = Boolean(scenario.includeCardInvoices);

    const result = calculateDecisionScenario(scenario);
    renderDecisionSimulation(result);
}

function deleteDecisionScenario(id) {
    if (!confirm('Excluir este cenário salvo?')) return;

    data.decisionScenarios = (data.decisionScenarios || []).filter(item => String(item.id) !== String(id));
    saveData();
    renderDecisionScenarios();

    alert('Cenário removido.');
}

function renderDecisionScenarios() {
    const container = document.getElementById('decisionScenariosList');
    if (!container) return;

    const scenarios = data.decisionScenarios || [];

    if (scenarios.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhum cenário salvo ainda</div>';
        return;
    }

    container.innerHTML = scenarios.map(scenario => `
        <div class="list-item">
            <div>
                <div style="font-weight:600;">${scenario.name}</div>
                <div style="font-size:12px; color:#7f8c8d;">
                    Início: ${scenario.startMonth} · Meses: ${scenario.months} · Saldo inicial: ${formatCurrency(Number(scenario.currentBalance) || 0)}
                </div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button class="secondary" style="padding: 6px 12px;" onclick="loadDecisionScenario('${scenario.id}')">Carregar</button>
                <button class="danger" style="padding: 6px 12px;" onclick="deleteDecisionScenario('${scenario.id}')">Excluir</button>
            </div>
        </div>
    `).join('');
}

const originalInitBeforeDecisionSimulator = init;
init = function() {
    originalInitBeforeDecisionSimulator();
    initializeDecisionSimulator();
};


const TRAINING_PROGRESS_KEY = 'financeTrainingProgressV1';

const trainingSteps = [
    {
        id: 'saldo',
        title: '1. Atualizar o saldo real',
        area: 'Visão Semanal',
        description: 'Comece informando o saldo real que aparece na sua conta bancária. Se houver diferença, o app cria um ajuste com histórico.',
        action: 'Vá em Visão Semanal, digite o saldo no campo Atualizar saldo e confirme.'
    },
    {
        id: 'entradas',
        title: '2. Lançar entradas previstas',
        area: 'Lançamentos',
        description: 'Cadastre tudo que deve entrar: emprego A, emprego B, comissão, recebimentos extras e valores temporários.',
        action: 'Vá em Lançamentos, escolha Dinheiro, tipo Entrada, preencha data, valor, categoria e responsável.'
    },
    {
        id: 'saidas',
        title: '3. Lançar saídas previstas',
        area: 'Lançamentos',
        description: 'Cadastre aluguel, internet, água, luz, mercado e outros compromissos da semana ou do mês.',
        action: 'Use tipo Saída e lance com a data prevista de pagamento.'
    },
    {
        id: 'baixa',
        title: '4. Dar baixa no que realmente aconteceu',
        area: 'Visão Semanal / Lançamentos',
        description: 'Nada vira real apenas porque a data passou. Você confirma manualmente o que entrou ou saiu.',
        action: 'Clique em Dar baixa, informe valor real, data real e observação se necessário.'
    },
    {
        id: 'cartoes',
        title: '5. Cadastrar cartões e lançar itens de fatura',
        area: 'Cartões',
        description: 'Cadastre seus cartões e lance compras à vista, parceladas, parcelas já em andamento e recorrentes.',
        action: 'Vá em Cartões, cadastre o cartão e use Adicionar item na fatura.'
    },
    {
        id: 'faturas',
        title: '6. Conferir faturas mensais',
        area: 'Cartões',
        description: 'A fatura mostra compras antigas, itens novos, recorrentes, total geral e subtotal por responsável.',
        action: 'Escolha o mês da fatura e confira os itens. Marque como aberta, fechada ou paga conforme o caso.'
    },
    {
        id: 'pagamento-fatura',
        title: '7. Gerar e baixar pagamento da fatura',
        area: 'Cartões / Lançamentos',
        description: 'O cartão não sai direto do caixa. Quem entra no fluxo semanal é o pagamento da fatura.',
        action: 'Gere o pagamento da fatura, depois vá em Lançamentos ou Visão Semanal e dê baixa quando pagar de verdade.'
    },
    {
        id: 'mercado',
        title: '8. Usar lista de mercado',
        area: 'Mercado',
        description: 'Monte sua lista semanal de compras e acompanhe histórico de preços.',
        action: 'Vá em Mercado, adicione produto, quantidade e preço estimado.'
    },
    {
        id: 'simulador',
        title: '9. Simular decisão financeira',
        area: 'Simulador',
        description: 'Use o simulador para avaliar saída de emprego, renda temporária, faturas futuras e necessidade de nova renda.',
        action: 'Vá em Simulador, clique em Preencher com dados atuais, ajuste os valores e simule.'
    },
    {
        id: 'backup',
        title: '10. Exportar e criar backup',
        area: 'Configurações',
        description: 'Como os dados ficam no navegador, exportar e criar backup é essencial.',
        action: 'Vá em Configurações > Dados e use Exportar Dados ou Backup Manual.'
    }
];

function getTrainingProgress() {
    try {
        const saved = localStorage.getItem(TRAINING_PROGRESS_KEY);
        if (!saved) return {};
        const parsed = JSON.parse(saved);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.warn('Erro ao carregar progresso do treinamento:', error);
        return {};
    }
}

function saveTrainingProgress(progress) {
    localStorage.setItem(TRAINING_PROGRESS_KEY, JSON.stringify(progress || {}));
}

function toggleTrainingStep(stepId) {
    const progress = getTrainingProgress();
    progress[stepId] = !progress[stepId];
    saveTrainingProgress(progress);
    renderTrainingModule();
}

function resetTrainingProgress() {
    if (!confirm('Reiniciar o progresso do treinamento?')) return;
    localStorage.removeItem(TRAINING_PROGRESS_KEY);
    renderTrainingModule();
}

function renderTrainingModule() {
    const container = document.getElementById('trainingStepsList');
    if (!container) return;

    const progress = getTrainingProgress();
    const completed = trainingSteps.filter(step => progress[step.id]).length;
    const total = trainingSteps.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    const progressValue = document.getElementById('trainingProgressValue');
    if (progressValue) progressValue.textContent = percent + '%';

    const progressText = document.getElementById('trainingProgressText');
    if (progressText) progressText.textContent = completed + ' de ' + total + ' etapas concluídas';

    container.innerHTML = trainingSteps.map(step => {
        const checked = Boolean(progress[step.id]);

        return `
            <div class="list-item" style="align-items:flex-start;">
                <div style="display:flex; gap:12px; flex:1;">
                    <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleTrainingStep('${step.id}')" style="width:auto; margin-top:4px;">
                    <div>
                        <div style="font-weight:700; color:#2c3e50;">${step.title}</div>
                        <div style="font-size:12px; color:#667eea; font-weight:600; margin:3px 0;">${step.area}</div>
                        <div style="font-size:14px; color:#555; margin-bottom:6px;">${step.description}</div>
                        <div style="font-size:13px; color:#7f8c8d;"><strong>Como fazer:</strong> ${step.action}</div>
                    </div>
                </div>
                <span class="badge ${checked ? 'status-realizado' : 'status-planejado'}">${checked ? 'Concluído' : 'Pendente'}</span>
            </div>
        `;
    }).join('');
}


function countPendingOverdueCashTransactions() {
    if (!Array.isArray(data.transacoes)) return 0;

    return data.transacoes.filter(t => {
        if (t.tipo !== 'dinheiro') return false;
        if (isBalanceAdjustmentTransaction(t)) return false;
        if (getDerivedStatus(t) !== 'atrasado') return false;
        return true;
    }).length;
}

function countOpenInvoiceWithoutPayment() {
    if (!Array.isArray(data.cardInvoices)) return 0;

    const currentMonth = new Date().toISOString().slice(0, 7);
    const nextMonth = addMonthsToMonthRef(currentMonth, 1);
    const monthsToCheck = [currentMonth, nextMonth];

    return data.cardInvoices.filter(invoice => {
        if (!invoice || !monthsToCheck.includes(invoice.monthRef)) return false;
        if (invoice.status === 'paga') return false;

        const amount = typeof getInvoicePaymentAmount === 'function'
            ? getInvoicePaymentAmount(invoice.cardId, invoice.monthRef)
            : 0;

        if (amount <= 0) return false;

        const payment = typeof findInvoicePaymentTransaction === 'function'
            ? findInvoicePaymentTransaction(invoice)
            : null;

        return !payment;
    }).length;
}

function getCurrentWeekProjectedBalanceForNextAction() {
    if (typeof calculateWeekFlow !== 'function' || typeof calculateProjectedOpeningBalanceForWeek !== 'function') {
        return Number(data.saldoAtual) || 0;
    }

    const flow = calculateWeekFlow(0);
    const base = calculateProjectedOpeningBalanceForWeek(0);

    return base + flow.entradasTotal - flow.saidasTotal;
}

function countActiveRecurringCardItems() {
    if (!Array.isArray(data.cardRecurringItems)) return 0;
    return data.cardRecurringItems.filter(item => item.status === 'active').length;
}

function getNextRecommendedAction() {
    const overdueCount = countPendingOverdueCashTransactions();

    if (overdueCount > 0) {
        return {
            level: 'danger',
            icon: '⏰',
            title: overdueCount === 1 ? 'Você tem 1 lançamento atrasado' : `Você tem ${overdueCount} lançamentos atrasados`,
            description: 'Dê baixa no que já aconteceu ou ajuste a previsão para manter o saldo real confiável.',
            buttonText: 'Ver lançamentos',
            page: 'lancamentos'
        };
    }

    const projectedBalance = getCurrentWeekProjectedBalanceForNextAction();
    const emergencyFund = Number(data.fundoEmergencia) || 0;

    if (emergencyFund > 0 && projectedBalance < emergencyFund) {
        return {
            level: 'warning',
            icon: '🛡️',
            title: 'Saldo projetado abaixo da reserva',
            description: `Se tudo previsto acontecer, a semana termina em ${formatCurrency(projectedBalance)}, abaixo do fundo de emergência.`,
            buttonText: 'Ver semana',
            page: 'semanal'
        };
    }

    const invoicesWithoutPayment = countOpenInvoiceWithoutPayment();

    if (invoicesWithoutPayment > 0) {
        return {
            level: 'warning',
            icon: '💳',
            title: invoicesWithoutPayment === 1 ? 'Existe fatura sem pagamento gerado' : `Existem ${invoicesWithoutPayment} faturas sem pagamento gerado`,
            description: 'Gere o pagamento da fatura para que ela entre no fluxo semanal como saída prevista.',
            buttonText: 'Ver cartões',
            page: 'cartoes'
        };
    }

    const recurringCount = countActiveRecurringCardItems();

    if (recurringCount > 0) {
        return {
            level: 'success',
            icon: '🔁',
            title: 'Recorrentes ativas sob controle',
            description: `Você tem ${recurringCount} recorrente(s) ativa(s). Revise periodicamente para evitar cobranças esquecidas.`,
            buttonText: 'Ver cartões',
            page: 'cartoes'
        };
    }

    return {
        level: 'success',
        icon: '✅',
        title: 'Tudo em ordem por enquanto',
        description: 'Continue atualizando o saldo, dando baixa nos lançamentos e revisando as faturas da semana.',
        buttonText: 'Abrir treinamento',
        page: 'treinamento'
    };
}

function renderNextRecommendedAction() {
    const panel = document.getElementById('nextActionPanel');
    const icon = document.getElementById('nextActionIcon');
    const title = document.getElementById('nextActionTitle');
    const description = document.getElementById('nextActionDescription');
    const buttonWrap = document.getElementById('nextActionButtonWrap');

    if (!panel || !icon || !title || !description || !buttonWrap) return;

    const action = getNextRecommendedAction();

    panel.classList.remove('success', 'warning', 'danger');
    panel.classList.add(action.level);

    icon.textContent = action.icon;
    title.textContent = action.title;
    description.textContent = action.description;

    buttonWrap.innerHTML = `<button class="secondary" onclick="showPage('${action.page}')">${action.buttonText}</button>`;
}

const originalUpdateSemanalBeforeNextAction = updateSemanal;
updateSemanal = function() {
    originalUpdateSemanalBeforeNextAction();
    renderNextRecommendedAction();
};



function initializeDashboard() {
    const monthInput = document.getElementById('dashboardMonth');
    if (monthInput && !monthInput.value) {
        monthInput.value = new Date().toISOString().slice(0, 7);
    }
}

function getDashboardMonthRef() {
    const input = document.getElementById('dashboardMonth');
    return normalizeMonthRef(input && input.value ? input.value : new Date().toISOString().slice(0, 7));
}

function getDashboardTransactionDate(t) {
    const status = getDerivedStatus(t);
    if (status === 'confirmado') {
        return getTransactionActualDate(t) || getTransactionPlannedDate(t);
    }
    return getTransactionPlannedDate(t);
}

function getDashboardTransactionValue(t) {
    const status = getDerivedStatus(t);
    if (status === 'confirmado') return getTransactionActualValue(t);
    return getTransactionPlannedValue(t);
}

function getDashboardCashTransactionsForMonth(monthRef) {
    if (!Array.isArray(data.transacoes)) return [];

    return data.transacoes.filter(t => {
        if (t.tipo !== 'dinheiro') return false;
        if (isBalanceAdjustmentTransaction(t)) return false;
        if (getDerivedStatus(t) === 'cancelado') return false;

        const dateStr = getDashboardTransactionDate(t);
        if (!dateStr) return false;

        return normalizeMonthRef(dateStr) === monthRef;
    });
}

function calculateDashboardMonthSummary(monthRef) {
    const transactions = getDashboardCashTransactionsForMonth(monthRef);

    let entradasConfirmadas = 0;
    let entradasPrevistas = 0;
    let saidasConfirmadas = 0;
    let saidasPrevistas = 0;

    const categoryTotals = {};
    const expenses = [];

    transactions.forEach(t => {
        const status = getDerivedStatus(t);
        const value = getDashboardTransactionValue(t);

        if (t.subTipo === 'entrada') {
            if (status === 'confirmado') entradasConfirmadas += value;
            else entradasPrevistas += value;
        }

        if (t.subTipo === 'saida') {
            if (status === 'confirmado') saidasConfirmadas += value;
            else saidasPrevistas += value;

            const category = t.categoria || 'Sem categoria';
            categoryTotals[category] = (categoryTotals[category] || 0) + value;

            expenses.push({
                descricao: t.descricao || 'Despesa',
                categoria: category,
                status,
                valor: value,
                data: getDashboardTransactionDate(t)
            });
        }
    });

    const entradasTotal = entradasConfirmadas + entradasPrevistas;
    const saidasTotal = saidasConfirmadas + saidasPrevistas;
    const resultado = entradasTotal - saidasTotal;
    const faturasMes = getAllCardInvoicesAmountForMonth(monthRef);

    return {
        monthRef,
        entradasConfirmadas,
        entradasPrevistas,
        saidasConfirmadas,
        saidasPrevistas,
        entradasTotal,
        saidasTotal,
        resultado,
        faturasMes,
        categoryTotals,
        expenses
    };
}

function renderDashboardSummary(summary) {
    const container = document.getElementById('dashboardSummaryCards');
    if (!container) return;

    container.innerHTML = `
        <div class="card">
            <h3>Entradas do mês</h3>
            <div class="value positive">${formatCurrency(summary.entradasTotal)}</div>
            <div class="subtext">Confirmadas + previstas</div>
        </div>
        <div class="card">
            <h3>Saídas do mês</h3>
            <div class="value negative">${formatCurrency(summary.saidasTotal)}</div>
            <div class="subtext">Confirmadas + previstas</div>
        </div>
        <div class="card">
            <h3>Resultado projetado</h3>
            <div class="value ${summary.resultado >= 0 ? 'positive' : 'negative'}">${formatCurrency(summary.resultado)}</div>
            <div class="subtext">Entradas - saídas</div>
        </div>
        <div class="card">
            <h3>Faturas no mês</h3>
            <div class="value warning">${formatCurrency(summary.faturasMes)}</div>
            <div class="subtext">Responsável Meu</div>
        </div>
    `;
}

function renderDashboardPlannedConfirmed(summary) {
    const container = document.getElementById('dashboardPlannedConfirmed');
    if (!container) return;

    container.innerHTML = `
        <div class="dashboard-grid-two">
            <div class="dashboard-insight-card">
                <strong>Entradas</strong>
                <table class="dashboard-mini-table">
                    <tr><td>Confirmadas</td><td style="text-align:right; color: var(--success);">${formatCurrency(summary.entradasConfirmadas)}</td></tr>
                    <tr><td>Previstas/Atrasadas</td><td style="text-align:right;">${formatCurrency(summary.entradasPrevistas)}</td></tr>
                    <tr><td><strong>Total</strong></td><td style="text-align:right;"><strong>${formatCurrency(summary.entradasTotal)}</strong></td></tr>
                </table>
            </div>
            <div class="dashboard-insight-card">
                <strong>Saídas</strong>
                <table class="dashboard-mini-table">
                    <tr><td>Confirmadas</td><td style="text-align:right; color: var(--danger);">${formatCurrency(summary.saidasConfirmadas)}</td></tr>
                    <tr><td>Previstas/Atrasadas</td><td style="text-align:right;">${formatCurrency(summary.saidasPrevistas)}</td></tr>
                    <tr><td><strong>Total</strong></td><td style="text-align:right;"><strong>${formatCurrency(summary.saidasTotal)}</strong></td></tr>
                </table>
            </div>
        </div>
    `;
}

function renderDashboardCategories(summary) {
    const container = document.getElementById('dashboardCategoryList');
    if (!container) return;

    const entries = Object.entries(summary.categoryTotals)
        .sort((a, b) => b[1] - a[1]);

    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhuma saída encontrada neste mês</div>';
        return;
    }

    const max = Math.max(...entries.map(([, value]) => value), 1);

    container.innerHTML = entries.map(([category, value]) => {
        const percent = Math.round((value / max) * 100);

        return `
            <div class="list-item" style="display:block;">
                <div style="display:flex; justify-content:space-between; gap:12px;">
                    <strong>${category}</strong>
                    <strong>${formatCurrency(value)}</strong>
                </div>
                <div class="dashboard-meter">
                    <div class="dashboard-meter-fill" style="width:${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderDashboardFutureWeeks() {
    const container = document.getElementById('dashboardFutureWeeks');
    if (!container) return;

    const rows = [];

    for (let i = 0; i < 4; i++) {
        const range = getWeekRange(i);
        const flow = calculateWeekFlow(i);
        const opening = calculateProjectedOpeningBalanceForWeek(i);
        const closing = opening + flow.entradasTotal - flow.saidasTotal;

        rows.push({
            label: `${formatDate(range.inicio.toISOString().split('T')[0])} - ${formatDate(range.fim.toISOString().split('T')[0])}`,
            opening,
            entradas: flow.entradasTotal,
            saidas: flow.saidasTotal,
            closing
        });
    }

    container.innerHTML = `
        <div style="overflow-x:auto;">
            <table class="dashboard-mini-table">
                <thead>
                    <tr>
                        <th>Semana</th>
                        <th style="text-align:right;">Saldo inicial</th>
                        <th style="text-align:right;">Entradas</th>
                        <th style="text-align:right;">Saídas</th>
                        <th style="text-align:right;">Saldo final</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            <td>${row.label}</td>
                            <td style="text-align:right;">${formatCurrency(row.opening)}</td>
                            <td style="text-align:right; color: var(--success);">${formatCurrency(row.entradas)}</td>
                            <td style="text-align:right; color: var(--danger);">${formatCurrency(row.saidas)}</td>
                            <td style="text-align:right; color: ${row.closing >= 0 ? 'var(--success)' : 'var(--danger)'};">${formatCurrency(row.closing)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderDashboardFutureInvoices() {
    const container = document.getElementById('dashboardFutureInvoices');
    if (!container) return;

    if (!Array.isArray(data.cartoes) || data.cartoes.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhum cartão cadastrado</div>';
        return;
    }

    const currentMonth = new Date().toISOString().slice(0, 7);
    const rows = [];

    for (let i = 0; i < 6; i++) {
        const monthRef = addMonthsToMonthRef(currentMonth, i);
        const amount = getAllCardInvoicesAmountForMonth(monthRef);
        rows.push({ monthRef, amount });
    }

    container.innerHTML = `
        <div style="overflow-x:auto;">
            <table class="dashboard-mini-table">
                <thead>
                    <tr>
                        <th>Mês</th>
                        <th style="text-align:right;">Faturas previstas</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            <td>${row.monthRef}</td>
                            <td style="text-align:right; color: var(--warning);">${formatCurrency(row.amount)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderDashboardTopExpenses(summary) {
    const container = document.getElementById('dashboardTopExpenses');
    if (!container) return;

    const expenses = summary.expenses
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 8);

    if (expenses.length === 0) {
        container.innerHTML = '<div class="empty-state">Nenhuma despesa encontrada neste mês</div>';
        return;
    }

    container.innerHTML = expenses.map(item => `
        <div class="transaction-item">
            <div class="transaction-info">
                <div class="transaction-description">
                    ${item.descricao}
                    <span class="badge cat">${item.categoria}</span>
                    <span class="badge status-planejado">${item.status}</span>
                </div>
                <div class="transaction-meta">${item.data ? formatDate(item.data) : ''}</div>
            </div>
            <div class="transaction-amount expense">${formatCurrency(item.valor)}</div>
        </div>
    `).join('');
}

function renderDashboard() {
    initializeDashboard();

    const monthRef = getDashboardMonthRef();
    if (!monthRef) return;

    const summary = calculateDashboardMonthSummary(monthRef);

    renderDashboardSummary(summary);
    renderDashboardPlannedConfirmed(summary);
    renderDashboardCategories(summary);
    renderDashboardFutureWeeks();
    renderDashboardFutureInvoices();
    renderDashboardTopExpenses(summary);
}



const originalInitBeforeDashboard = init;
init = function() {
    originalInitBeforeDashboard();
    initializeDashboard();
};


function getDashboardFutureMonthRefs(count = 6) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const months = [];

    for (let i = 0; i < count; i++) {
        months.push(addMonthsToMonthRef(currentMonth, i));
    }

    return months;
}

function getCardInvoiceTotalAllResponsibles(cardId, monthRef) {
    const purchases = typeof getCardInvoicePurchases === 'function'
        ? getCardInvoicePurchases(cardId, monthRef)
        : [];

    return purchases.reduce((total, item) => total + (Number(item.valor) || 0), 0);
}

function countActiveCardInstallments() {
    if (!Array.isArray(data.cardItems)) return 0;

    return data.cardItems.filter(item => {
        if (!item || item.status === 'cancelled') return false;
        if (item.type !== 'installment' && item.type !== 'existing_installment') return false;

        const installments = generateCardItemInstallmentsPreview(item);
        return installments.length > 0;
    }).length;
}

function calculateCardBIDashboard(monthsAhead = 6) {
    const months = getDashboardFutureMonthRefs(monthsAhead);
    const cards = Array.isArray(data.cartoes) ? data.cartoes : [];

    const monthRows = [];
    const cardTotals = {};
    let totalMeu = 0;
    let totalAll = 0;
    let nextInvoiceAmount = 0;
    let highestInvoice = { monthRef: null, cardName: '', amount: 0 };
    let biggestCard = { cardName: '', amount: 0 };

    cards.forEach(card => {
        cardTotals[String(card.id)] = {
            card,
            totalMeu: 0,
            totalAll: 0
        };
    });

    months.forEach((monthRef, monthIndex) => {
        const row = {
            monthRef,
            totalMeu: 0,
            totalAll: 0,
            cards: []
        };

        cards.forEach(card => {
            const meu = Number(calcularTotalFaturaPorResponsavel(card.id, monthRef, 'Meu')) || 0;
            const all = getCardInvoiceTotalAllResponsibles(card.id, monthRef);

            row.totalMeu += meu;
            row.totalAll += all;

            cardTotals[String(card.id)].totalMeu += meu;
            cardTotals[String(card.id)].totalAll += all;

            if (monthIndex === 0) {
                nextInvoiceAmount += meu;
            }

            if (meu > highestInvoice.amount) {
                highestInvoice = {
                    monthRef,
                    cardName: card.nome,
                    amount: meu
                };
            }

            row.cards.push({
                cardId: card.id,
                cardName: card.nome,
                meu,
                all
            });
        });

        totalMeu += row.totalMeu;
        totalAll += row.totalAll;
        monthRows.push(row);
    });

    Object.values(cardTotals).forEach(item => {
        if (item.totalMeu > biggestCard.amount) {
            biggestCard = {
                cardName: item.card.nome,
                amount: item.totalMeu
            };
        }
    });

    const activeRecurring = Array.isArray(data.cardRecurringItems)
        ? data.cardRecurringItems.filter(item => item.status === 'active')
        : [];

    const activeInstallments = countActiveCardInstallments();

    return {
        months,
        cards,
        monthRows,
        cardTotals,
        totalMeu,
        totalAll,
        nextInvoiceAmount,
        highestInvoice,
        biggestCard,
        activeRecurring,
        activeInstallments
    };
}

function renderDashboardCardBI() {
    const container = document.getElementById('dashboardCardBI');
    if (!container) return;

    const bi = calculateCardBIDashboard(6);

    if (!bi.cards.length) {
        container.innerHTML = '<div class="empty-state">Nenhum cartão cadastrado ainda</div>';
        return;
    }

    const summaryCards = `
        <div class="card-bi-grid">
            <div class="card">
                <h3>Próximos 6 meses</h3>
                <div class="value warning">${formatCurrency(bi.totalMeu)}</div>
                <div class="subtext">Faturas responsável Meu</div>
            </div>
            <div class="card">
                <h3>Próxima fatura</h3>
                <div class="value warning">${formatCurrency(bi.nextInvoiceAmount)}</div>
                <div class="subtext">Mês atual</div>
            </div>
            <div class="card">
                <h3>Maior fatura</h3>
                <div class="value negative">${formatCurrency(bi.highestInvoice.amount)}</div>
                <div class="subtext">${bi.highestInvoice.cardName || 'Sem cartão'} · ${bi.highestInvoice.monthRef || '-'}</div>
            </div>
            <div class="card">
                <h3>Recorrentes ativas</h3>
                <div class="value">${bi.activeRecurring.length}</div>
                <div class="subtext">Assinaturas mensais</div>
            </div>
            <div class="card">
                <h3>Parcelamentos ativos</h3>
                <div class="value">${bi.activeInstallments}</div>
                <div class="subtext">Itens parcelados</div>
            </div>
            <div class="card">
                <h3>Cartão mais pesado</h3>
                <div class="value warning">${formatCurrency(bi.biggestCard.amount)}</div>
                <div class="subtext">${bi.biggestCard.cardName || 'Sem dados'}</div>
            </div>
        </div>
    `;

    const monthTable = `
        <div style="overflow-x:auto;">
            <table class="dashboard-mini-table">
                <thead>
                    <tr>
                        <th>Mês</th>
                        <th style="text-align:right;">Total Meu</th>
                        <th style="text-align:right;">Total Geral</th>
                        <th>Detalhe por cartão</th>
                    </tr>
                </thead>
                <tbody>
                    ${bi.monthRows.map(row => `
                        <tr>
                            <td>${row.monthRef}</td>
                            <td style="text-align:right; color: var(--warning);">${formatCurrency(row.totalMeu)}</td>
                            <td style="text-align:right;">${formatCurrency(row.totalAll)}</td>
                            <td>
                                ${row.cards.map(card => `
                                    <span class="card-bi-pill">${card.cardName}: ${formatCurrency(card.meu)}</span>
                                `).join(' ')}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    const recurringList = bi.activeRecurring.length
        ? bi.activeRecurring.slice(0, 8).map(item => `
            <div class="card-bi-row">
                <div>
                    <strong>${item.description}</strong><br>
                    <span>${item.cardName || 'Cartão'} · início ${item.startInvoiceMonth}</span>
                </div>
                <strong>${formatCurrency(Number(item.amount) || 0)}</strong>
            </div>
        `).join('')
        : '<div class="empty-state">Nenhuma recorrente ativa</div>';

    const cardRanking = Object.values(bi.cardTotals)
        .sort((a, b) => b.totalMeu - a.totalMeu)
        .map(item => `
            <div class="card-bi-row">
                <div>
                    <strong>${item.card.nome}</strong><br>
                    <span>Total geral: ${formatCurrency(item.totalAll)}</span>
                </div>
                <strong>${formatCurrency(item.totalMeu)}</strong>
            </div>
        `).join('');

    container.innerHTML = `
        ${summaryCards}
        <div class="dashboard-grid-two">
            <div class="dashboard-insight-card">
                <strong>Faturas mês a mês</strong>
                <div style="margin-top: 12px;">${monthTable}</div>
            </div>
            <div class="dashboard-insight-card">
                <strong>Ranking por cartão</strong>
                <div class="card-bi-list" style="margin-top: 12px;">${cardRanking || '<div class="empty-state">Sem dados</div>'}</div>

                <div style="height: 16px;"></div>

                <strong>Recorrentes ativas</strong>
                <div class="card-bi-list" style="margin-top: 12px;">${recurringList}</div>
            </div>
        </div>
    `;
}



const originalRenderDashboardBeforeCardBI = renderDashboard;
renderDashboard = function() {
    originalRenderDashboardBeforeCardBI();
    renderDashboardCardBI();
};


function isMarketCategoryName(category) {
    return String(category || '').toLowerCase().startsWith('mercado');
}

function getMarketExpensesForMonth(monthRef) {
    const transactions = typeof getDashboardCashTransactionsForMonth === 'function'
        ? getDashboardCashTransactionsForMonth(monthRef)
        : [];

    return transactions.filter(t => {
        if (t.subTipo !== 'saida') return false;
        if (!isMarketCategoryName(t.categoria)) return false;
        return true;
    });
}

function getCurrentShoppingListTotal() {
    if (!Array.isArray(data.listaMercado)) return 0;

    return data.listaMercado.reduce((total, item) => {
        return total + (Number(item.preco) || 0);
    }, 0);
}

function getCurrentShoppingListPendingTotal() {
    if (!Array.isArray(data.listaMercado)) return 0;

    return data.listaMercado
        .filter(item => !item.comprado)
        .reduce((total, item) => total + (Number(item.preco) || 0), 0);
}

function calculatePriceTrendsSummary() {
    const historico = data.historicoPrecos || {};
    let up = 0;
    let down = 0;
    let same = 0;
    const details = [];

    Object.entries(historico).forEach(([produto, entries]) => {
        if (!Array.isArray(entries) || entries.length < 2) return;

        const sorted = [...entries].sort((a, b) => new Date(b.data) - new Date(a.data));
        const latest = sorted[0];
        const previous = sorted[1];

        const latestPrice = Number(latest.preco) || 0;
        const previousPrice = Number(previous.preco) || 0;

        if (previousPrice <= 0) return;

        const diff = latestPrice - previousPrice;
        const percent = (diff / previousPrice) * 100;

        if (diff > 0) up++;
        else if (diff < 0) down++;
        else same++;

        details.push({
            produto,
            latestPrice,
            previousPrice,
            diff,
            percent
        });
    });

    details.sort((a, b) => Math.abs(b.percent) - Math.abs(a.percent));

    return { up, down, same, details };
}

function calculateMarketCategoryBI(monthRef) {
    const summary = calculateDashboardMonthSummary(monthRef);
    const marketTransactions = getMarketExpensesForMonth(monthRef);

    const marketTotal = marketTransactions.reduce((total, t) => {
        return total + getDashboardTransactionValue(t);
    }, 0);

    const marketCategoryTotals = {};
    marketTransactions.forEach(t => {
        const category = t.categoria || 'Mercado';
        marketCategoryTotals[category] = (marketCategoryTotals[category] || 0) + getDashboardTransactionValue(t);
    });

    const categoryRanking = Object.entries(summary.categoryTotals || {})
        .sort((a, b) => b[1] - a[1]);

    const marketRanking = Object.entries(marketCategoryTotals)
        .sort((a, b) => b[1] - a[1]);

    const weeklyAverageMarket = marketTotal / 4.33;
    const listTotal = getCurrentShoppingListTotal();
    const listPendingTotal = getCurrentShoppingListPendingTotal();
    const trends = calculatePriceTrendsSummary();

    const highestCategory = categoryRanking.length
        ? { name: categoryRanking[0][0], amount: categoryRanking[0][1] }
        : { name: 'Sem dados', amount: 0 };

    const marketShare = summary.saidasTotal > 0 ? (marketTotal / summary.saidasTotal) * 100 : 0;

    return {
        monthRef,
        summary,
        marketTotal,
        weeklyAverageMarket,
        listTotal,
        listPendingTotal,
        trends,
        categoryRanking,
        marketRanking,
        highestCategory,
        marketShare
    };
}

function renderCategoryRankingList(entries, emptyText) {
    if (!entries || entries.length === 0) {
        return `<div class="empty-state">${emptyText}</div>`;
    }

    const max = Math.max(...entries.map(([, value]) => value), 1);

    return entries.map(([category, value]) => {
        const percent = Math.round((value / max) * 100);

        return `
            <div class="market-bi-row" style="display:block;">
                <div style="display:flex; justify-content:space-between; gap:12px;">
                    <strong>${category}</strong>
                    <strong>${formatCurrency(value)}</strong>
                </div>
                <div class="dashboard-meter">
                    <div class="dashboard-meter-fill" style="width:${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function renderPriceTrendList(trends) {
    if (!trends || !trends.details || trends.details.length === 0) {
        return '<div class="empty-state">Ainda não há histórico suficiente para comparar preços</div>';
    }

    return trends.details.slice(0, 8).map(item => {
        const trendClass = item.diff > 0
            ? 'market-bi-trend-up'
            : item.diff < 0
                ? 'market-bi-trend-down'
                : 'market-bi-trend-same';

        const arrow = item.diff > 0 ? '↑' : item.diff < 0 ? '↓' : '━';

        return `
            <div class="market-bi-row">
                <div>
                    <strong>${item.produto}</strong><br>
                    <span>${formatCurrency(item.previousPrice)} → ${formatCurrency(item.latestPrice)}</span>
                </div>
                <div class="${trendClass}">${arrow} ${Math.abs(item.percent).toFixed(0)}%</div>
            </div>
        `;
    }).join('');
}

function renderDashboardMarketCategoryBI() {
    const container = document.getElementById('dashboardMarketCategoryBI');
    if (!container) return;

    const monthRef = typeof getDashboardMonthRef === 'function'
        ? getDashboardMonthRef()
        : new Date().toISOString().slice(0, 7);

    const bi = calculateMarketCategoryBI(monthRef);

    const summaryCards = `
        <div class="market-bi-grid">
            <div class="card">
                <h3>Mercado no mês</h3>
                <div class="value warning">${formatCurrency(bi.marketTotal)}</div>
                <div class="subtext">${bi.marketShare.toFixed(0)}% das saídas do mês</div>
            </div>
            <div class="card">
                <h3>Média semanal mercado</h3>
                <div class="value">${formatCurrency(bi.weeklyAverageMarket)}</div>
                <div class="subtext">Estimativa pelo mês analisado</div>
            </div>
            <div class="card">
                <h3>Lista atual</h3>
                <div class="value">${formatCurrency(bi.listTotal)}</div>
                <div class="subtext">Total estimado da lista</div>
            </div>
            <div class="card">
                <h3>Pendente na lista</h3>
                <div class="value warning">${formatCurrency(bi.listPendingTotal)}</div>
                <div class="subtext">Itens ainda não marcados</div>
            </div>
            <div class="card">
                <h3>Categoria mais pesada</h3>
                <div class="value negative">${formatCurrency(bi.highestCategory.amount)}</div>
                <div class="subtext">${bi.highestCategory.name}</div>
            </div>
            <div class="card">
                <h3>Preços subindo</h3>
                <div class="value negative">${bi.trends.up}</div>
                <div class="subtext">Produtos com alta no histórico</div>
            </div>
        </div>
    `;

    container.innerHTML = `
        ${summaryCards}

        <div class="market-bi-detail-grid">
            <div class="dashboard-insight-card">
                <strong>Ranking de despesas por categoria</strong>
                <div style="margin-top: 12px;">
                    ${renderCategoryRankingList(bi.categoryRanking, 'Nenhuma despesa encontrada neste mês')}
                </div>
            </div>

            <div class="dashboard-insight-card">
                <strong>Mercado por subcategoria</strong>
                <div style="margin-top: 12px;">
                    ${renderCategoryRankingList(bi.marketRanking, 'Nenhuma despesa de mercado encontrada neste mês')}
                </div>
            </div>
        </div>

        <div style="height: 16px;"></div>

        <div class="dashboard-insight-card">
            <strong>Tendência de preços</strong>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin: 10px 0 12px;">
                <span class="card-bi-pill">Subindo: ${bi.trends.up}</span>
                <span class="card-bi-pill">Caindo: ${bi.trends.down}</span>
                <span class="card-bi-pill">Estáveis: ${bi.trends.same}</span>
            </div>
            ${renderPriceTrendList(bi.trends)}
        </div>
    `;
}



const originalRenderDashboardBeforeMarketBI = renderDashboard;
renderDashboard = function() {
    originalRenderDashboardBeforeMarketBI();
    renderDashboardMarketCategoryBI();
};


function renderDecisionScenarioCompareOptions() {
    const selectA = document.getElementById('decisionCompareA');
    const selectB = document.getElementById('decisionCompareB');

    if (!selectA || !selectB) return;

    const scenarios = Array.isArray(data.decisionScenarios) ? data.decisionScenarios : [];

    const previousA = selectA.value;
    const previousB = selectB.value;

    if (scenarios.length === 0) {
        selectA.innerHTML = '<option value="">Nenhum cenário salvo</option>';
        selectB.innerHTML = '<option value="">Nenhum cenário salvo</option>';
        return;
    }

    const options = scenarios.map(scenario => {
        return `<option value="${scenario.id}">${scenario.name || 'Cenário sem nome'} — ${scenario.startMonth || ''}</option>`;
    }).join('');

    selectA.innerHTML = '<option value="">Selecione...</option>' + options;
    selectB.innerHTML = '<option value="">Selecione...</option>' + options;

    if (previousA && scenarios.some(s => String(s.id) === String(previousA))) {
        selectA.value = previousA;
    } else if (scenarios[0]) {
        selectA.value = scenarios[0].id;
    }

    if (previousB && scenarios.some(s => String(s.id) === String(previousB))) {
        selectB.value = previousB;
    } else if (scenarios[1]) {
        selectB.value = scenarios[1].id;
    } else if (scenarios[0]) {
        selectB.value = scenarios[0].id;
    }
}

function findDecisionScenarioById(id) {
    return (data.decisionScenarios || []).find(scenario => String(scenario.id) === String(id));
}

function renderDecisionComparisonCard(label, result) {
    const scenario = result.scenario;

    return `
        <div class="decision-comparison-card">
            <h4>${label}: ${scenario.name || 'Cenário sem nome'}</h4>
            <div>Período: <strong>${scenario.startMonth}</strong> por <strong>${scenario.months}</strong> meses</div>
            <div>Saldo final: <strong>${formatCurrency(result.finalBalance)}</strong></div>
            <div>Menor saldo: <strong>${formatCurrency(result.lowestBalance)}</strong></div>
            <div>Mês de risco: <strong>${result.firstDangerMonth || 'Não chegou ao risco'}</strong></div>
            <div>Renda sugerida: <strong>${formatCurrency(result.recommendedMonthlyIncome || 0)}</strong></div>
            <div>Faturas no período: <strong>${formatCurrency(result.totalCardInvoices || 0)}</strong></div>
        </div>
    `;
}

function compareDecisionScenarios() {
    const selectA = document.getElementById('decisionCompareA');
    const selectB = document.getElementById('decisionCompareB');
    const container = document.getElementById('decisionComparisonResults');

    if (!selectA || !selectB || !container) return;

    const scenarioA = findDecisionScenarioById(selectA.value);
    const scenarioB = findDecisionScenarioById(selectB.value);

    if (!scenarioA || !scenarioB) {
        alert('Selecione dois cenários para comparar.');
        return;
    }

    const resultA = calculateDecisionScenario(scenarioA);
    const resultB = calculateDecisionScenario(scenarioB);

    const maxRows = Math.max(resultA.rows.length, resultB.rows.length);
    const rows = [];

    for (let i = 0; i < maxRows; i++) {
        const rowA = resultA.rows[i] || null;
        const rowB = resultB.rows[i] || null;

        const monthRef = rowA?.monthRef || rowB?.monthRef || '-';
        const balanceA = rowA ? rowA.closingBalance : null;
        const balanceB = rowB ? rowB.closingBalance : null;
        const resultMonthA = rowA ? rowA.result : null;
        const resultMonthB = rowB ? rowB.result : null;
        const difference = balanceA !== null && balanceB !== null ? balanceB - balanceA : null;

        rows.push({
            monthRef,
            balanceA,
            balanceB,
            resultMonthA,
            resultMonthB,
            difference
        });
    }

    const finalDifference = resultB.finalBalance - resultA.finalBalance;
    const recommendedDifference = (resultB.recommendedMonthlyIncome || 0) - (resultA.recommendedMonthlyIncome || 0);

    const summaryClass = finalDifference >= 0 ? 'alert-success' : 'alert-warning';

    container.innerHTML = `
        <div class="alert ${summaryClass}">
            <strong>Comparação final:</strong><br>
            Diferença de saldo final entre B e A:
            <span class="${finalDifference >= 0 ? 'decision-difference-positive' : 'decision-difference-negative'}">${formatCurrency(finalDifference)}</span><br>
            Diferença na renda mensal sugerida:
            <span class="${recommendedDifference <= 0 ? 'decision-difference-positive' : 'decision-difference-negative'}">${formatCurrency(recommendedDifference)}</span>
        </div>

        <div class="decision-comparison-grid">
            ${renderDecisionComparisonCard('Cenário A', resultA)}
            ${renderDecisionComparisonCard('Cenário B', resultB)}
        </div>

        <div style="overflow-x:auto;">
            <table class="dashboard-mini-table">
                <thead>
                    <tr>
                        <th>Mês</th>
                        <th style="text-align:right;">Resultado A</th>
                        <th style="text-align:right;">Saldo A</th>
                        <th style="text-align:right;">Resultado B</th>
                        <th style="text-align:right;">Saldo B</th>
                        <th style="text-align:right;">Diferença B - A</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            <td>${row.monthRef}</td>
                            <td style="text-align:right;">${row.resultMonthA !== null ? formatCurrency(row.resultMonthA) : '-'}</td>
                            <td style="text-align:right;">${row.balanceA !== null ? formatCurrency(row.balanceA) : '-'}</td>
                            <td style="text-align:right;">${row.resultMonthB !== null ? formatCurrency(row.resultMonthB) : '-'}</td>
                            <td style="text-align:right;">${row.balanceB !== null ? formatCurrency(row.balanceB) : '-'}</td>
                            <td style="text-align:right;" class="${row.difference >= 0 ? 'decision-difference-positive' : 'decision-difference-negative'}">
                                ${row.difference !== null ? formatCurrency(row.difference) : '-'}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}



const originalRenderDecisionScenariosBeforeCompare = renderDecisionScenarios;
renderDecisionScenarios = function() {
    originalRenderDecisionScenariosBeforeCompare();
    renderDecisionScenarioCompareOptions();
};


const TRAINING_MODULES_V2 = [
    {
        id: 'visao-geral',
        title: '1. Entendendo o app',
        area: 'Visão geral',
        objective: 'Compreender que o app trabalha com fluxo real e fluxo projetado.',
        explanation: 'A ideia central é separar o que está previsto do que realmente aconteceu. Assim você enxerga a semana, as próximas faturas e decisões futuras com mais segurança.',
        steps: [
            'Abra a Visão Semanal.',
            'Observe Saldo Base, Entradas Previstas, Saídas Previstas e Saldo Projetado.',
            'Veja a Próxima Ação recomendada no topo.'
        ],
        example: 'Se uma conta venceu ontem, ela não vira paga sozinha. Ela fica atrasada até você dar baixa.',
        checklist: [
            'Entendi a diferença entre previsto e confirmado.',
            'Entendi que o saldo projetado depende do que ainda vai acontecer.'
        ]
    },
    {
        id: 'saldo-real',
        title: '2. Atualizar saldo real',
        area: 'Visão Semanal',
        objective: 'Manter o saldo do app alinhado com o banco.',
        explanation: 'O saldo real é a base da projeção. Quando ele não bate com o banco, o app cria um ajuste com histórico para registrar a diferença.',
        steps: [
            'Confira o saldo real no banco.',
            'Digite esse valor no card Saldo Atual.',
            'Clique em Atualizar.',
            'Confira se apareceu Correção manual de saldo em Lançamentos.'
        ],
        example: 'Sistema: R$ 1.000. Banco: R$ 950. O app registra ajuste de -R$ 50 e passa a projetar a partir de R$ 950.',
        checklist: [
            'Sei atualizar o saldo conforme o banco.',
            'Sei que o ajuste não entra duas vezes nas entradas/saídas.'
        ]
    },
    {
        id: 'entradas-saidas',
        title: '3. Lançar entradas e saídas',
        area: 'Lançamentos',
        objective: 'Registrar tudo que vai entrar e sair antes de acontecer.',
        explanation: 'Entradas e saídas previstas formam o mapa da sua semana. Elas mostram quanto deve entrar, quanto deve sair e como ficará o saldo se tudo acontecer.',
        steps: [
            'Vá em Lançamentos.',
            'Escolha Dinheiro.',
            'Selecione Entrada ou Saída.',
            'Informe data, valor, categoria, responsável e descrição.',
            'Salve o lançamento.'
        ],
        example: 'Emprego A como entrada prevista. Aluguel, luz, internet e mercado como saídas previstas.',
        checklist: [
            'Sei lançar uma entrada prevista.',
            'Sei lançar uma saída prevista.'
        ]
    },
    {
        id: 'baixa-manual',
        title: '4. Dar baixa no que aconteceu',
        area: 'Semana / Lançamentos',
        objective: 'Confirmar o valor real recebido ou pago.',
        explanation: 'Dar baixa transforma uma previsão em realidade. Você pode confirmar valor e data reais, mesmo que sejam diferentes do previsto.',
        steps: [
            'Encontre um lançamento previsto ou atrasado.',
            'Clique em Dar baixa.',
            'Informe o valor realizado.',
            'Informe a data realizada.',
            'Adicione observação se quiser.'
        ],
        example: 'Luz prevista: R$ 180. Valor pago: R$ 213,40. O saldo real usa R$ 213,40.',
        checklist: [
            'Sei confirmar uma entrada.',
            'Sei confirmar uma saída.',
            'Entendi que data passada não significa pago automaticamente.'
        ]
    },
    {
        id: 'cartoes-faturas',
        title: '5. Cartões e faturas',
        area: 'Cartões',
        objective: 'Controlar a fatura real antes dela pesar no caixa.',
        explanation: 'Compra no cartão não é saída imediata do fluxo. Quem entra no caixa é o pagamento da fatura.',
        steps: [
            'Cadastre seus cartões em Configurações.',
            'Vá em Cartões.',
            'Adicione item na fatura.',
            'Confira a fatura por mês.',
            'Gere o pagamento da fatura para entrar no fluxo semanal.'
        ],
        example: 'Uma compra de R$ 300 em 3x aparece nas próximas três faturas, mas só afeta o caixa quando o pagamento da fatura entra como saída.',
        checklist: [
            'Sei cadastrar cartão.',
            'Sei lançar compra à vista.',
            'Sei lançar compra parcelada.',
            'Sei gerar pagamento da fatura.'
        ]
    },
    {
        id: 'parcelas-recorrentes',
        title: '6. Parcelas em andamento e recorrentes',
        area: 'Cartões',
        objective: 'Registrar compromissos que continuam nos meses seguintes.',
        explanation: 'Parcelas antigas e assinaturas mensais precisam aparecer nas faturas futuras para sua projeção ficar realista.',
        steps: [
            'Para compra antiga, escolha Parcela já em andamento.',
            'Informe parcela atual, total e valor da parcela.',
            'Para assinatura, escolha Recorrente mensal.',
            'Informe valor mensal e mês inicial.',
            'Desative recorrentes quando cancelar o serviço.'
        ],
        example: 'Parcela 4/10 de R$ 120 começa este mês e segue até 10/10. Netflix aparece todo mês até ser desativada.',
        checklist: [
            'Sei lançar parcela já em andamento.',
            'Sei cadastrar recorrente mensal.',
            'Sei desativar recorrente.'
        ]
    },
    {
        id: 'mercado',
        title: '7. Mercado e preços',
        area: 'Mercado',
        objective: 'Planejar compras e acompanhar preços.',
        explanation: 'A lista de mercado ajuda no planejamento semanal. O histórico de preços mostra produtos subindo, caindo ou estáveis.',
        steps: [
            'Vá em Mercado.',
            'Adicione produto, quantidade e preço estimado.',
            'Marque como comprado quando concluir.',
            'Acompanhe histórico de preços e gastos de mercado.'
        ],
        example: 'Carne R$ 120, verdura R$ 50, frutas R$ 30. Isso ajuda a prever gastos semanais.',
        checklist: [
            'Sei montar lista de mercado.',
            'Sei acompanhar histórico de preços.'
        ]
    },
    {
        id: 'dashboard',
        title: '8. Dashboard BI',
        area: 'Dashboard',
        objective: 'Analisar dados sem poluir a tela inicial.',
        explanation: 'O Dashboard é a área analítica. A tela inicial continua clean, enquanto o BI mostra categorias, mercado, faturas e projeções.',
        steps: [
            'Vá em Dashboard.',
            'Escolha o mês de análise.',
            'Confira resumo, previsto x confirmado e categorias.',
            'Confira BI de cartões e mercado.'
        ],
        example: 'Você pode descobrir qual categoria pesa mais, qual cartão compromete mais e quais faturas futuras estão crescendo.',
        checklist: [
            'Sei usar o Dashboard.',
            'Sei interpretar faturas futuras e categorias.'
        ]
    },
    {
        id: 'simulador-decisao',
        title: '9. Simulador de decisão',
        area: 'Simulador',
        objective: 'Avaliar decisões como sair de uma renda fixa.',
        explanation: 'O simulador projeta saldo mês a mês, inclui faturas futuras e mostra quando o saldo fica perigoso.',
        steps: [
            'Vá em Simulador.',
            'Clique em Preencher com dados atuais.',
            'Informe valor total a receber e divisão em meses.',
            'Informe rendas que continuam e despesas mensais.',
            'Simule, salve e compare cenários.'
        ],
        example: 'Cenário A: continuar no emprego. Cenário B: sair e receber R$ 20.000 em 12 meses.',
        checklist: [
            'Sei simular um cenário.',
            'Sei salvar e comparar cenários.'
        ]
    },
    {
        id: 'backup-seguranca',
        title: '10. Backup e segurança',
        area: 'Configurações',
        objective: 'Proteger os dados salvos no navegador.',
        explanation: 'Os dados ficam no localStorage do navegador. Por isso, exportar dados e criar backups é essencial.',
        steps: [
            'Vá em Configurações.',
            'Use Exportar Dados regularmente.',
            'Use Backup Manual antes de grandes alterações.',
            'Guarde o JSON em local seguro.'
        ],
        example: 'Antes de limpar navegador, trocar computador ou mexer em dados importantes, exporte o JSON.',
        checklist: [
            'Sei exportar dados.',
            'Sei criar backup manual.',
            'Entendi que limpar o navegador pode apagar dados locais.'
        ]
    }
];

function renderTrainingModuleV2() {
    const container = document.getElementById('trainingStepsList');
    if (!container) return;

    const progress = getTrainingProgress();
    const completed = TRAINING_MODULES_V2.filter(module => progress[module.id]).length;
    const total = TRAINING_MODULES_V2.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    const progressValue = document.getElementById('trainingProgressValue');
    if (progressValue) progressValue.textContent = percent + '%';

    const progressText = document.getElementById('trainingProgressText');
    if (progressText) progressText.textContent = completed + ' de ' + total + ' módulos concluídos';

    container.innerHTML = TRAINING_MODULES_V2.map(module => {
        const checked = Boolean(progress[module.id]);

        const stepsHtml = module.steps.map(step => '<li>' + step + '</li>').join('');
        const checklistHtml = module.checklist.map(item => '<li>' + item + '</li>').join('');

        return `
            <div class="training-module-card ${checked ? 'completed' : ''}">
                <div class="training-module-header">
                    <div>
                        <div class="training-module-title">${module.title}</div>
                        <div class="training-module-area">${module.area}</div>
                    </div>
                    <span class="badge ${checked ? 'status-realizado' : 'status-planejado'}">${checked ? 'Aprendido' : 'Pendente'}</span>
                </div>

                <div class="training-module-box">
                    <strong>Objetivo</strong>
                    <p>${module.objective}</p>
                    <p>${module.explanation}</p>
                </div>

                <div class="training-module-body">
                    <div class="training-module-box">
                        <strong>Passo a passo</strong>
                        <ol>${stepsHtml}</ol>
                    </div>
                    <div class="training-module-box">
                        <strong>Exemplo prático</strong>
                        <p>${module.example}</p>
                        <strong>Checklist</strong>
                        <ul>${checklistHtml}</ul>
                    </div>
                </div>

                <div class="training-module-actions">
                    <label class="training-module-check">
                        <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleTrainingStep('${module.id}')">
                        Marcar este módulo como aprendido
                    </label>
                </div>
            </div>
        `;
    }).join('');
}

// Substitui a renderização antiga por módulos completos.
renderTrainingModule = renderTrainingModuleV2;


const CONTEXT_HELP_CONTENT = {
    semana: {
        title: 'Como usar a Visão Semanal',
        text: 'Esta tela é o painel de comando do dia a dia. Ela mostra o que já foi confirmado, o que ainda está previsto e como a semana deve terminar.',
        items: [
            'Saldo Base: saldo real informado conforme o banco.',
            'Entradas Confirmadas: valores que realmente entraram.',
            'Entradas Previstas: valores esperados ou atrasados.',
            'Saídas Confirmadas: valores que realmente foram pagos.',
            'Saídas Previstas: contas que ainda precisam ser pagas.',
            'Saldo Projetado: como a semana termina se tudo previsto acontecer.'
        ],
        trainingId: 'visao-geral'
    },
    lancamentos: {
        title: 'Como usar Lançamentos',
        text: 'Aqui você registra entradas e saídas antes de acontecerem. Depois, dá baixa quando o dinheiro realmente entra ou sai.',
        items: [
            'Use Entrada para salário, comissão, pix recebido e outras rendas.',
            'Use Saída para aluguel, contas, mercado e compromissos.',
            'Lançamentos novos nascem como previstos.',
            'Clique em Dar baixa para confirmar valor e data reais.'
        ],
        trainingId: 'entradas-saidas'
    },
    cartoes: {
        title: 'Como usar Cartões e Faturas',
        text: 'O cartão registra o compromisso futuro. A saída real do caixa acontece quando você gera e paga a fatura.',
        items: [
            'Cadastre cartões com limite, fechamento e pagamento.',
            'Adicione compra à vista, parcelada, parcela em andamento ou recorrente.',
            'Confira a fatura por mês.',
            'Gere o pagamento da fatura para entrar no fluxo semanal.',
            'Dê baixa no pagamento quando realmente pagar.'
        ],
        trainingId: 'cartoes-faturas'
    },
    mercado: {
        title: 'Como usar Mercado',
        text: 'A lista de mercado ajuda a planejar compras e acompanhar histórico de preços.',
        items: [
            'Adicione produto, quantidade e preço estimado.',
            'Marque como comprado quando concluir.',
            'Use o histórico para perceber produtos que estão subindo ou caindo.',
            'Use esses valores para estimar despesas variáveis.'
        ],
        trainingId: 'mercado'
    },
    dashboard: {
        title: 'Como usar o Dashboard',
        text: 'O Dashboard é a área BI do app. Ele mostra análises sem deixar a tela inicial carregada.',
        items: [
            'Veja entradas, saídas e resultado do mês.',
            'Compare previsto x confirmado.',
            'Analise categorias mais pesadas.',
            'Veja faturas futuras e cartões mais comprometidos.',
            'Use mercado e tendências de preço para ajustar previsões.'
        ],
        trainingId: 'dashboard'
    },
    simulador: {
        title: 'Como usar o Simulador de Decisão',
        text: 'Use esta área para avaliar decisões financeiras importantes, como sair de um emprego ou viver por alguns meses com renda temporária.',
        items: [
            'Clique em Preencher com dados atuais.',
            'Informe valor total a receber e em quantos meses será dividido.',
            'Informe rendas que continuam e despesas mensais.',
            'Inclua faturas futuras para uma projeção mais realista.',
            'Salve cenários e compare alternativas.'
        ],
        trainingId: 'simulador-decisao'
    },
    configuracoes: {
        title: 'Como usar Configurações e Backup',
        text: 'Aqui ficam categorias, responsáveis, cartões, exportação, importação e diagnóstico dos dados.',
        items: [
            'Cadastre categorias e responsáveis.',
            'Cadastre cartões antes de lançar faturas.',
            'Exporte dados regularmente.',
            'Crie backup manual antes de grandes mudanças.',
            'Use Verificar Dados para diagnosticar inconsistências.'
        ],
        trainingId: 'backup-seguranca'
    }
};

function showContextHelp(helpId) {
    const help = CONTEXT_HELP_CONTENT[helpId];

    if (!help) {
        alert('Ajuda não encontrada.');
        return;
    }

    closeContextHelp();

    const modal = document.createElement('div');
    modal.className = 'context-help-modal';
    modal.id = 'contextHelpModal';

    const itemsHtml = help.items.map(item => '<li>' + item + '</li>').join('');

    modal.innerHTML = `
        <div class="context-help-card">
            <h3>${help.title}</h3>
            <p>${help.text}</p>
            <ul>${itemsHtml}</ul>
            <div class="context-help-actions">
                <button class="secondary" onclick="openTrainingFromHelp('${help.trainingId}')">Ver no treinamento</button>
                <button onclick="closeContextHelp()">Entendi</button>
            </div>
        </div>
    `;

    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeContextHelp();
        }
    });

    document.body.appendChild(modal);
}

function closeContextHelp() {
    const modal = document.getElementById('contextHelpModal');
    if (modal) modal.remove();
}

function openTrainingFromHelp(trainingId) {
    closeContextHelp();
    showPage('treinamento');

    setTimeout(() => {
        const progress = getTrainingProgress();
        if (trainingId && !progress[trainingId]) {
            // Apenas abre o treinamento; não marca como concluído automaticamente.
        }
    }, 50);
}


function createContextHelpButton(helpId) {
    const button = document.createElement('button');
    button.className = 'help-chip';
    button.type = 'button';
    button.textContent = 'Ajuda';
    button.setAttribute('data-help-id', helpId);
    button.onclick = function() {
        showContextHelp(helpId);
    };
    return button;
}

function addContextHelpButtonToPage(pageId, helpId) {
    const page = document.getElementById(pageId);
    if (!page) return;

    if (page.querySelector('.help-chip[data-help-id="' + helpId + '"]')) {
        return;
    }

    const firstSection = page.querySelector('.section');
    if (!firstSection) return;

    let wrapper = firstSection.querySelector('.section-title-with-help');

    if (wrapper) {
        wrapper.appendChild(createContextHelpButton(helpId));
        return;
    }

    const heading = firstSection.querySelector('h2');

    if (heading) {
        wrapper = document.createElement('div');
        wrapper.className = 'section-title-with-help';

        heading.parentNode.insertBefore(wrapper, heading);
        wrapper.appendChild(heading);
        wrapper.appendChild(createContextHelpButton(helpId));
        return;
    }

    wrapper = document.createElement('div');
    wrapper.className = 'section-title-with-help';
    wrapper.innerHTML = '<h2>Ajuda da seção</h2>';
    wrapper.appendChild(createContextHelpButton(helpId));

    firstSection.insertBefore(wrapper, firstSection.firstChild);
}

function ensureContextHelpButtons() {
    addContextHelpButtonToPage('semanal', 'semana');
    addContextHelpButtonToPage('lancamentos', 'lancamentos');
    addContextHelpButtonToPage('cartoes', 'cartoes');
    addContextHelpButtonToPage('mercado', 'mercado');
    addContextHelpButtonToPage('dashboard', 'dashboard');
    addContextHelpButtonToPage('simulador', 'simulador');
    addContextHelpButtonToPage('configuracoes', 'configuracoes');
}

const originalShowPageBeforeHelpButtons = showPage;
showPage = function(pageId) {
    originalShowPageBeforeHelpButtons(pageId);
    ensureContextHelpButtons();
};

const originalInitBeforeHelpButtons = init;
init = function() {
    originalInitBeforeHelpButtons();
    ensureContextHelpButtons();
};


const VIEW_MODE_STORAGE_KEY = 'financeViewModeV1';

function getCurrentViewMode() {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return saved === 'advanced' ? 'advanced' : 'clean';
}

function setCurrentViewMode(mode) {
    const safeMode = mode === 'advanced' ? 'advanced' : 'clean';
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, safeMode);
    applyViewMode();
}

function toggleViewMode() {
    const current = getCurrentViewMode();
    setCurrentViewMode(current === 'clean' ? 'advanced' : 'clean');
}

function applyViewMode() {
    const mode = getCurrentViewMode();

    document.body.classList.remove('view-mode-clean', 'view-mode-advanced');
    document.body.classList.add(mode === 'advanced' ? 'view-mode-advanced' : 'view-mode-clean');

    const label = document.getElementById('viewModeToggleLabel');
    if (label) {
        label.textContent = mode === 'advanced' ? 'Modo Avançado' : 'Modo Clean';
    }

    const hint = document.getElementById('viewModeToggleHint');
    if (hint) {
        hint.textContent = mode === 'advanced' ? 'Mostrando detalhes' : 'Visão simplificada';
    }
}

function initializeViewModeToggle() {
    if (!document.getElementById('viewModeToggle')) {
        const button = document.createElement('button');
        button.id = 'viewModeToggle';
        button.type = 'button';
        button.className = 'view-mode-toggle';
        button.onclick = toggleViewMode;
        button.innerHTML = `
            <span class="view-mode-dot"></span>
            <span id="viewModeToggleLabel">Modo Clean</span>
            <span style="opacity:.55;">·</span>
            <span id="viewModeToggleHint" style="opacity:.75;">Visão simplificada</span>
        `;

        document.body.appendChild(button);
    }

    applyViewMode();
}

function addAdvancedBadge(section) {
    if (!section || section.querySelector('.advanced-only-badge')) return;

    const heading = section.querySelector('h2, h3');
    if (!heading) return;

    const badge = document.createElement('span');
    badge.className = 'advanced-only-badge';
    badge.textContent = 'Avançado';
    heading.appendChild(badge);
}

function markSectionAsAdvanced(section) {
    if (!section) return;

    section.setAttribute('data-advanced-section', 'true');
    addAdvancedBadge(section);
}

function sectionContainsText(section, words) {
    const text = String(section.textContent || '').toLowerCase();
    return words.some(word => text.includes(String(word).toLowerCase()));
}

function markAdvancedSections() {
    const semanal = document.getElementById('semanal');
    if (semanal) {
        const cleanNoteId = 'cleanModeNoteSemanal';

        if (!document.getElementById(cleanNoteId)) {
            const note = document.createElement('div');
            note.id = cleanNoteId;
            note.className = 'clean-mode-note';
            note.innerHTML = 'Modo Clean ativo: detalhes analíticos da semana estão ocultos. Use o botão no canto inferior para ver o modo avançado.';

            const nextAction = document.getElementById('nextActionPanel');
            if (nextAction && nextAction.parentNode) {
                nextAction.parentNode.insertBefore(note, nextAction.nextSibling);
            } else {
                semanal.insertBefore(note, semanal.firstChild);
            }
        }

        const sections = Array.from(semanal.querySelectorAll('.section'));

        sections.forEach(section => {
            if (section.id === 'quickStartPanel') return;
            if (section.id === 'nextActionPanel') return;

            const hasWeeklyCards =
                section.querySelector('#weekSaldoBase') ||
                section.querySelector('#weekEntradasConfirmadas') ||
                section.querySelector('#weekSaldoProjetado');

            if (hasWeeklyCards) return;

            const shouldBeAdvanced = sectionContainsText(section, [
                'projeção do mês',
                'próximas semanas',
                'timeline',
                'alertas',
                'transações da semana',
                'lançamentos da semana',
                'projeção mensal'
            ]);

            if (shouldBeAdvanced) {
                markSectionAsAdvanced(section);
            }
        });
    }
}

const originalShowPageBeforeViewMode = showPage;
showPage = function(pageId) {
    originalShowPageBeforeViewMode(pageId);
    markAdvancedSections();
    applyViewMode();
};

const originalInitBeforeViewMode = init;
init = function() {
    originalInitBeforeViewMode();
    initializeViewModeToggle();
    markAdvancedSections();
    applyViewMode();
};


function getFinalReviewStatus(condition, okText, warningText) {
    return {
        ok: Boolean(condition),
        text: condition ? okText : warningText
    };
}

function runFinalAppReview() {
    const review = [];

    const hasSchema = Boolean(data.schemaVersion);
    const hasAccounts = Array.isArray(data.accounts) && data.accounts.length > 0;
    const hasTransactions = Array.isArray(data.transacoes);
    const hasCardModel =
        Array.isArray(data.cardItems) &&
        Array.isArray(data.cardRecurringItems) &&
        Array.isArray(data.cardInvoices);
    const hasCards = Array.isArray(data.cartoes) && data.cartoes.length > 0;
    const hasTraining = typeof renderTrainingModule === 'function';
    const hasDashboard = typeof renderDashboard === 'function';
    const hasDecisionSimulator = typeof runDecisionSimulation === 'function';
    const hasDataHealth = typeof runDataHealthCheck === 'function';
    const hasViewMode = typeof getCurrentViewMode === 'function';

    const overdue = typeof countPendingOverdueCashTransactions === 'function'
        ? countPendingOverdueCashTransactions()
        : 0;

    const activeRecurring = Array.isArray(data.cardRecurringItems)
        ? data.cardRecurringItems.filter(item => item.status === 'active').length
        : 0;

    const scenarios = Array.isArray(data.decisionScenarios)
        ? data.decisionScenarios.length
        : 0;

    review.push({
        title: 'Schema e migração',
        status: getFinalReviewStatus(hasSchema && hasAccounts, 'Estrutura versionada ativa', 'Verifique schemaVersion/accounts')
    });

    review.push({
        title: 'Fluxo semanal',
        status: getFinalReviewStatus(hasTransactions && typeof calculateWeekFlow === 'function', 'Cálculo semanal ativo', 'Cálculo semanal não encontrado')
    });

    review.push({
        title: 'Baixa manual',
        status: getFinalReviewStatus(typeof confirmTransaction === 'function', 'Baixa manual ativa', 'Função de baixa não encontrada')
    });

    review.push({
        title: 'Ajuste de saldo',
        status: getFinalReviewStatus(typeof createBalanceAdjustmentTransaction === 'function', 'Ajuste com histórico ativo', 'Ajuste com histórico não encontrado')
    });

    review.push({
        title: 'Cartões e faturas',
        status: getFinalReviewStatus(hasCardModel, 'Modelo novo de cartões ativo', 'Modelo de cartões incompleto')
    });

    review.push({
        title: 'Dashboard BI',
        status: getFinalReviewStatus(hasDashboard, 'Dashboard ativo', 'Dashboard não encontrado')
    });

    review.push({
        title: 'Simulador de decisão',
        status: getFinalReviewStatus(hasDecisionSimulator, 'Simulador ativo', 'Simulador não encontrado')
    });

    review.push({
        title: 'Treinamento',
        status: getFinalReviewStatus(hasTraining, 'Treinamento ativo', 'Treinamento não encontrado')
    });

    review.push({
        title: 'Diagnóstico de dados',
        status: getFinalReviewStatus(hasDataHealth, 'Verificação de dados ativa', 'Diagnóstico não encontrado')
    });

    review.push({
        title: 'Modo Clean/Avançado',
        status: getFinalReviewStatus(hasViewMode, 'Alternância visual ativa', 'Modo visual não encontrado')
    });

    return {
        generatedAt: new Date().toISOString(),
        review,
        metrics: {
            transacoes: Array.isArray(data.transacoes) ? data.transacoes.length : 0,
            cartoes: Array.isArray(data.cartoes) ? data.cartoes.length : 0,
            cardItems: Array.isArray(data.cardItems) ? data.cardItems.length : 0,
            recorrentesAtivas: activeRecurring,
            faturas: Array.isArray(data.cardInvoices) ? data.cardInvoices.length : 0,
            cenariosSalvos: scenarios,
            lancamentosAtrasados: overdue,
            viewMode: hasViewMode ? getCurrentViewMode() : 'não disponível'
        }
    };
}

function renderFinalAppReview() {
    const container = document.getElementById('finalAppReviewResults');
    if (!container) return;

    const result = runFinalAppReview();

    const criticalWarnings = result.review.filter(item => !item.status.ok).length;

    const summaryClass = criticalWarnings === 0 ? 'alert-success' : 'alert-warning';

    const reviewHtml = result.review.map(item => {
        const cls = item.status.ok ? 'final-review-ok' : 'final-review-warning';
        const icon = item.status.ok ? '✅' : '⚠️';

        return `
            <div class="final-review-item">
                <strong>${icon} ${item.title}</strong>
                <span class="${cls}">${item.status.text}</span>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="alert ${summaryClass}">
            <strong>Resultado da revisão:</strong><br>
            ${criticalWarnings === 0 ? 'O núcleo funcional do app está estruturado e pronto para testes de uso real.' : 'Há pontos que merecem revisão antes do uso intenso.'}<br>
            Gerado em: ${result.generatedAt}
        </div>

        <div class="final-review-grid">
            ${reviewHtml}
        </div>

        <div class="dashboard-insight-card">
            <strong>Métricas atuais</strong>
            <table class="dashboard-mini-table">
                <tr><td>Transações</td><td style="text-align:right;">${result.metrics.transacoes}</td></tr>
                <tr><td>Cartões</td><td style="text-align:right;">${result.metrics.cartoes}</td></tr>
                <tr><td>Itens de fatura</td><td style="text-align:right;">${result.metrics.cardItems}</td></tr>
                <tr><td>Recorrentes ativas</td><td style="text-align:right;">${result.metrics.recorrentesAtivas}</td></tr>
                <tr><td>Faturas registradas</td><td style="text-align:right;">${result.metrics.faturas}</td></tr>
                <tr><td>Cenários salvos</td><td style="text-align:right;">${result.metrics.cenariosSalvos}</td></tr>
                <tr><td>Lançamentos atrasados</td><td style="text-align:right;">${result.metrics.lancamentosAtrasados}</td></tr>
                <tr><td>Modo visual</td><td style="text-align:right;">${result.metrics.viewMode}</td></tr>
            </table>
        </div>
    `;
}

function ensureFinalReviewPanel() {
    const page = document.getElementById('configuracoes');
    if (!page) return;

    if (document.getElementById('finalAppReviewPanel')) return;

    const section = document.createElement('div');
    section.className = 'section final-review-panel';
    section.id = 'finalAppReviewPanel';

    section.innerHTML = `
        <div class="section-title-with-help">
            <h2>✅ Revisão Final do App</h2>
            <button class="help-chip" onclick="showContextHelp('configuracoes')">Ajuda</button>
        </div>
        <p style="color: var(--text-muted); margin-bottom: 14px;">
            Use esta revisão para conferir se o núcleo do app está funcionando antes de usar dados financeiros reais com mais intensidade.
        </p>
        <div class="btn-group">
            <button onclick="renderFinalAppReview()">Rodar revisão final</button>
            <button class="secondary" onclick="showDataHealthCheck()">Verificar dados</button>
            <button class="secondary" onclick="createManualBackupFromUI()">Backup manual</button>
        </div>
        <div id="finalAppReviewResults" style="margin-top: 18px;"></div>
    `;

    page.appendChild(section);
}

const originalShowPageBeforeFinalReview = showPage;
showPage = function(pageId) {
    originalShowPageBeforeFinalReview(pageId);
    if (pageId === 'configuracoes') {
        ensureFinalReviewPanel();
    }
};

const originalInitBeforeFinalReview = init;
init = function() {
    originalInitBeforeFinalReview();
    ensureFinalReviewPanel();
};



/* PATCH 26B — SIMULADOR GUIADO */
function ensureDecisionSimulatorGuide() {
    const simulatorPage = document.getElementById('simulador');
    if (!simulatorPage) return;

    if (!document.getElementById('decisionGuidePanel')) {
        const guide = document.createElement('div');
        guide.className = 'section decision-guide-panel';
        guide.id = 'decisionGuidePanel';

        guide.innerHTML = `
            <div class="decision-guide-header">
                <div>
                    <div class="clean-home-eyebrow">Simulador estratégico</div>
                    <h2>Simulador de Decisão em 3 passos</h2>
                    <p>
                        Use esta área para responder uma pergunta prática:
                        se eu perder uma renda fixa, receber um valor parcelado e continuar com minhas despesas,
                        em que mês o saldo fica perigoso e quanta nova renda preciso gerar?
                    </p>
                </div>
            </div>

            <div class="decision-guide-steps">
                <div class="decision-guide-step">
                    <strong>1. Ponto de partida</strong>
                    <span>Informe saldo inicial, mês inicial e saldo mínimo de segurança.</span>
                </div>
                <div class="decision-guide-step">
                    <strong>2. O que muda</strong>
                    <span>Informe renda que deixa de entrar, valor a receber parcelado e rendas que continuam.</span>
                </div>
                <div class="decision-guide-step">
                    <strong>3. Resultado</strong>
                    <span>Veja mês a mês se sobra, falta, quando há risco e qual renda seria necessária.</span>
                </div>
            </div>

            <div class="decision-guide-actions">
                <button class="secondary" onclick="prefillDecisionSimulatorFromApp()">⚙️ Preencher com dados atuais</button>
                <button onclick="fillExitJobDecisionScenario()">🧭 Modelo: sair de um emprego</button>
                <button class="secondary" onclick="toggleDecisionSimpleHelp()">Como preencher?</button>
            </div>

            <div id="decisionSimpleHelp" class="decision-simple-help">
                <strong>Como pensar este simulador:</strong>
                <ul>
                    <li><strong>Valor total a receber:</strong> dinheiro que você receberá ao sair, comissão futura ou acerto.</li>
                    <li><strong>Dividir em meses:</strong> por quantos meses esse dinheiro vai ajudar no orçamento.</li>
                    <li><strong>Renda que deixarei de receber:</strong> salário fixo ou renda que vai parar de entrar.</li>
                    <li><strong>Rendas que continuam:</strong> tudo que continuará entrando normalmente.</li>
                    <li><strong>Nova renda esperada:</strong> renda que você acredita conseguir gerar.</li>
                    <li><strong>Despesas essenciais:</strong> aluguel, água, luz, internet, escola, contas fixas.</li>
                    <li><strong>Despesas variáveis:</strong> mercado, transporte, extras e gastos flexíveis.</li>
                    <li><strong>Saldo mínimo:</strong> limite de segurança. Abaixo dele o app acende alerta.</li>
                </ul>
            </div>
        `;

        const firstSection = simulatorPage.querySelector('.section');
        if (firstSection) {
            simulatorPage.insertBefore(guide, firstSection);
        } else {
            simulatorPage.insertBefore(guide, simulatorPage.firstChild);
        }
    }

    ensureDecisionFieldHints();
}

function toggleDecisionSimpleHelp() {
    const help = document.getElementById('decisionSimpleHelp');
    if (!help) return;
    help.classList.toggle('active');
}

function setDecisionValueIfExists(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = value ?? '';
}

function getDecisionValueIfExists(id) {
    const el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
}

function fillExitJobDecisionScenario() {
    if (typeof prefillDecisionSimulatorFromApp === 'function') {
        prefillDecisionSimulatorFromApp();
    }

    const totalAtual = getDecisionValueIfExists('decisionSeveranceTotal') || '20000';
    const mesesAtual = getDecisionValueIfExists('decisionSeveranceMonths') || '12';
    const rendaPerdidaAtual = getDecisionValueIfExists('decisionLostMonthlyIncome') || '0';

    const totalReceber = prompt('Qual valor total você tem para receber? Ex: 20000', totalAtual);
    if (totalReceber === null) return;

    const mesesReceber = prompt('Esse valor será dividido em quantos meses? Ex: 12', mesesAtual);
    if (mesesReceber === null) return;

    const rendaPerdida = prompt('Qual renda fixa mensal você deixará de receber? Ex: 3000', rendaPerdidaAtual);
    if (rendaPerdida === null) return;

    setDecisionValueIfExists('decisionScenarioName', 'Sair de um emprego');
    setDecisionValueIfExists('decisionMonths', 12);
    setDecisionValueIfExists('decisionSeveranceTotal', totalReceber);
    setDecisionValueIfExists('decisionSeveranceMonths', mesesReceber);
    setDecisionValueIfExists('decisionLostMonthlyIncome', rendaPerdida);

    if (!getDecisionValueIfExists('decisionExtraIncome')) {
        setDecisionValueIfExists('decisionExtraIncome', 0);
    }

    alert('Modelo preenchido. Agora revise as rendas que continuam, despesas essenciais e despesas variáveis antes de simular.');
}

function addDecisionFieldHint(fieldId, text) {
    const field = document.getElementById(fieldId);
    if (!field) return;

    const parent = field.closest('.form-group') || field.parentElement;
    if (!parent) return;

    if (parent.querySelector('.decision-field-hint[data-for="' + fieldId + '"]')) return;

    const hint = document.createElement('div');
    hint.className = 'decision-field-hint';
    hint.setAttribute('data-for', fieldId);
    hint.textContent = text;

    parent.appendChild(hint);
}

function ensureDecisionFieldHints() {
    addDecisionFieldHint('decisionScenarioName', 'Dê um nome simples, como: Sair do emprego A ou Continuar como estou.');
    addDecisionFieldHint('decisionStartMonth', 'Mês em que a simulação começa.');
    addDecisionFieldHint('decisionMonths', 'Quantos meses você quer enxergar à frente.');
    addDecisionFieldHint('decisionCurrentBalance', 'Saldo disponível hoje, normalmente o saldo do banco.');
    addDecisionFieldHint('decisionSeveranceTotal', 'Valor total que você receberá, como acerto, comissão ou reserva temporária.');
    addDecisionFieldHint('decisionSeveranceMonths', 'Em quantos meses esse valor será distribuído na simulação.');
    addDecisionFieldHint('decisionLostMonthlyIncome', 'Renda fixa mensal que deixará de entrar se você sair do emprego.');
    addDecisionFieldHint('decisionContinuingIncome', 'Rendas que continuarão entrando normalmente.');
    addDecisionFieldHint('decisionExtraIncome', 'Nova renda que você acredita conseguir gerar por mês.');
    addDecisionFieldHint('decisionEssentialExpenses', 'Contas fixas: aluguel, água, luz, internet, escola, financiamentos.');
    addDecisionFieldHint('decisionVariableExpenses', 'Gastos variáveis: mercado, transporte, extras, compras e ajustes.');
    addDecisionFieldHint('decisionMinimumBalance', 'Valor mínimo que você não quer ultrapassar para baixo.');
}

function appendDecisionResultHelp() {
    const container = document.getElementById('decisionSimulatorResults');
    if (!container) return;

    if (container.querySelector('.decision-result-help')) return;

    const help = document.createElement('div');
    help.className = 'decision-result-help';
    help.innerHTML = `
        <strong>Como interpretar:</strong><br>
        Se o saldo final fica acima do saldo mínimo, o cenário é mais seguro.
        Se aparece um mês de risco, aquele é o primeiro mês em que sua reserva fica abaixo do limite.
        A renda mensal sugerida mostra quanto você precisaria gerar para equilibrar o pior mês.
    `;

    container.appendChild(help);
}

if (typeof renderDecisionSimulation === 'function' && !window.__renderDecisionSimulationGuided) {
    window.__renderDecisionSimulationGuided = true;
    const originalRenderDecisionSimulationBeforeGuide = renderDecisionSimulation;

    renderDecisionSimulation = function(result) {
        originalRenderDecisionSimulationBeforeGuide(result);
        appendDecisionResultHelp();
    };
}

if (typeof showPage === 'function' && !window.__showPageDecisionGuideWrapped) {
    window.__showPageDecisionGuideWrapped = true;
    const originalShowPageBeforeDecisionGuide = showPage;

    showPage = function(pageId) {
        originalShowPageBeforeDecisionGuide(pageId);

        if (pageId === 'simulador') {
            ensureDecisionSimulatorGuide();
        }
    };
}

window.addEventListener('load', function() {
    ensureDecisionSimulatorGuide();
});

window.onload = init;


/* PATCH 26A — NAVEGAÇÃO ISOLADA */
(function() {
    const PAGE_IDS = [
        'semanal',
        'lancamentos',
        'mercado',
        'cartoes',
        'simulador',
        'dashboard',
        'treinamento',
        'configuracoes'
    ];

    function safeCall(fnName, ...args) {
        try {
            if (typeof window[fnName] === 'function') {
                return window[fnName](...args);
            }
        } catch (error) {
            console.warn('Erro ao executar ' + fnName + ':', error);
        }

        return null;
    }

    function getMainContainer() {
        return document.querySelector('.container') || document.body;
    }

    function repairPageStructure() {
        const container = getMainContainer();

        PAGE_IDS.forEach(pageId => {
            const page = document.getElementById(pageId);
            if (!page) return;

            if (page.parentElement !== container) {
                container.appendChild(page);
            }
        });
    }

    function activateNavTab(pageId) {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');

            const onclick = tab.getAttribute('onclick') || '';
            if (
                onclick.includes("'" + pageId + "'") ||
                onclick.includes('"' + pageId + '"')
            ) {
                tab.classList.add('active');
            }
        });
    }

    function renderPageAfterNavigation(pageId) {
        if (pageId === 'semanal') {
            safeCall('updateSemanal');
            safeCall('renderNextRecommendedAction');
            safeCall('markAdvancedSections');
            safeCall('applyViewMode');
        }

        if (pageId === 'lancamentos') {
            safeCall('updateAllSelects');
            safeCall('renderTodasTransacoes');
        }

        if (pageId === 'mercado') {
            safeCall('updateMercado');
        }

        if (pageId === 'cartoes') {
            safeCall('updateAllSelects');
            safeCall('renderCartoes');
            safeCall('updateFaturas');
            safeCall('renderCardRecurringItems');
            safeCall('updateCardItemForm');
        }

        if (pageId === 'simulador') {
            safeCall('initializeDecisionSimulator');
            safeCall('renderDecisionScenarios');
        }

        if (pageId === 'dashboard') {
            safeCall('initializeDashboard');
            safeCall('renderDashboard');
        }

        if (pageId === 'treinamento') {
            safeCall('renderTrainingModule');
        }

        if (pageId === 'configuracoes') {
            safeCall('updateAllSelects');
            safeCall('renderCartoes');
            safeCall('ensureFinalReviewPanel');
        }

        safeCall('ensureContextHelpButtons');
    }

    window.showPage = function(pageId) {
        repairPageStructure();

        let target = document.getElementById(pageId);

        if (!target) {
            console.warn('Página não encontrada:', pageId);
            pageId = 'semanal';
            target = document.getElementById(pageId);
        }

        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
            page.style.display = 'none';
        });

        if (target) {
            target.classList.add('active');
            target.style.display = 'block';
        }

        activateNavTab(pageId);

        document.body.setAttribute('data-current-page', pageId);

        renderPageAfterNavigation(pageId);

        setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 30);
    };

    const previousOnload = window.onload;

    window.onload = function(event) {
        if (typeof previousOnload === 'function') {
            previousOnload.call(window, event);
        }

        repairPageStructure();

        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
            page.style.display = 'none';
        });

        const initialPage = document.getElementById('semanal') ? 'semanal' : PAGE_IDS.find(id => document.getElementById(id));

        if (initialPage) {
            window.showPage(initialPage);
        }
    };
})();
