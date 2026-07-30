import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getDatabase, ref, push, onValue, update, remove } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js';
import { getAuth, signInWithEmailAndPassword, updatePassword } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyDHWf2EQlduZelU7OHTyO0rEyMnwUvGnBo",
    authDomain: "nathaliaadv-bcb75.firebaseapp.com",
    databaseURL: "https://nathaliaadv-bcb75-default-rtdb.firebaseio.com",
    projectId: "nathaliaadv-bcb75",
    storageBucket: "nathaliaadv-bcb75.firebasestorage.app",
    messagingSenderId: "206784049039",
    appId: "1:206784049039:web:3c7db1335655cabfe0a5fa"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// --- VERIFICAÇÃO DE CONEXÃO ---
const connectedRef = ref(database, ".info/connected");
onValue(connectedRef, (snap) => {
    const indicator = document.getElementById('firebase-indicator');
    const statusText = document.getElementById('firebase-status-text');
    
    if (indicator && statusText) {
        if (snap.val() === true) {
            indicator.classList.remove('status-indicator--warning', 'status-indicator--error');
            indicator.classList.add('status-indicator--success');
            statusText.textContent = "Conectado à base de dados";
        } else {
            indicator.classList.remove('status-indicator--success');
            indicator.classList.add('status-indicator--warning');
            statusText.textContent = "Conectando ao Firebase...";
        }
    }
});

const USER_MAPPING = {
    "Nathalia": "nathalia@hotmail.com",
    "Evelyn": "evelyn@hotmail.com"
};

let currentUser = null;
let todosContratos = [];
let todosClientes = [];
let sortDiasDesc = true;

// --- FUNÇÕES DE TEMPO UTC-3 E DATAS ---
function getBrasiliaDate() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function formatPtBr(dateObj) {
    return dateObj.toLocaleDateString('pt-BR');
}

function getTodayStringISO() {
    const d = getBrasiliaDate();
    return d.toISOString().split('T')[0];
}

function getCurrentMonthISO() {
    const d = getBrasiliaDate();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

function somarMesesData(dataISO, mesesAdicionar) {
    if (!dataISO) return "";
    const partes = dataISO.split('-');
    let ano = parseInt(partes[0], 10);
    let mes = parseInt(partes[1], 10) - 1 + mesesAdicionar;
    let dia = parseInt(partes[2], 10);

    ano += Math.floor(mes / 12);
    mes = mes % 12;
    if (mes < 0) {
        mes += 12;
        ano -= 1;
    }

    const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
    if (dia > ultimoDiaMes) {
        dia = ultimoDiaMes;
    }

    const d = new Date(ano, mes, dia);
    let y = d.getFullYear();
    let m = String(d.getMonth() + 1).padStart(2, '0');
    let day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// --- NAVEGAÇÃO ---
document.querySelectorAll('.btn-voltar').forEach(btn => {
    btn.addEventListener('click', () => showScreen('dashboard-screen'));
});
document.querySelectorAll('.btn-fechar-modal').forEach(btn => {
    btn.addEventListener('click', (e) => e.target.closest('.modal').classList.add('hidden'));
});

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if(id === 'dashboard-screen') calcularEstatisticas();
}

// Botões Dashboard
document.getElementById('nav-cad-cliente').onclick = () => showScreen('cadastro-cliente-screen');
document.getElementById('nav-catalogo').onclick = () => { renderCatalogo(); showScreen('catalogo-screen'); };
document.getElementById('nav-cadastro').onclick = () => { resetCadastroContratoForm(); showScreen('cadastro-screen'); };
document.getElementById('nav-clientes').onclick = () => showScreen('clientes-screen');
document.getElementById('nav-pesquisa-data').onclick = () => showScreen('pesquisa-data-screen');
document.getElementById('nav-basedados').onclick = () => { renderBaseDados(); showScreen('basedados-screen'); };
document.getElementById('nav-estatistica').onclick = () => { renderEstatistica(); showScreen('estatistica-screen'); };
document.getElementById('nav-perfil').onclick = () => document.getElementById('profile-modal').classList.remove('hidden');

document.getElementById('btn-dashboard-atrasados').onclick = () => {
    renderEstatistica();
    showScreen('estatistica-screen');
};

// --- AUTENTICAÇÃO ---
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('user-select').value;
    const pass = document.getElementById('password').value;
    
    if (!user) return alert("Selecione o usuário");
    
    try {
        await signInWithEmailAndPassword(auth, USER_MAPPING[user], pass);
        currentUser = user;
        document.getElementById('user-info').textContent = `Usuário: ${user}`;
        showScreen('dashboard-screen');
        carregarDados();
        setInterval(() => {
            document.getElementById('datetime-info').textContent = formatPtBr(getBrasiliaDate()) + " " + getBrasiliaDate().toLocaleTimeString('pt-BR');
        }, 1000);
    } catch (err) {
        alert("Erro no login. Verifique a senha.");
    }
});

document.getElementById('logout-btn').onclick = () => {
    auth.signOut();
    currentUser = null;
    showScreen('login-screen');
};

document.getElementById('password-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
        await updatePassword(auth.currentUser, document.getElementById('new-password').value);
        alert("Senha alterada!");
        document.getElementById('profile-modal').classList.add('hidden');
    } catch (err) {
        alert("Erro ao alterar senha. Talvez precise relogar.");
    }
};

// --- SINCRONIZAÇÃO BD ---
function carregarDados() {
    onValue(ref(database, 'contratos'), (snapshot) => {
        todosContratos = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            for (let key in data) {
                // Migração de dados de parcelas antigas para o novo formato
                let contrato = data[key];
                if(contrato.parcelas) {
                    contrato.parcelas = contrato.parcelas.map(p => {
                        let original = p.valorOriginal || contrato.valorParcela;
                        let esperado = p.valorEsperado !== undefined ? p.valorEsperado : original;
                        let pago = p.valorPago !== undefined ? p.valorPago : (p.paga ? esperado : 0);
                        return { ...p, valorOriginal: original, valorEsperado: esperado, valorPago: pago };
                    });
                }
                todosContratos.push({ id: key, ...contrato });
            }
        }
        todosContratos.sort((a, b) => b.timestamp - a.timestamp);
        calcularEstatisticas();
        if(!document.getElementById('basedados-screen').classList.contains('hidden')) renderBaseDados();
    });

    onValue(ref(database, 'clientes'), (snapshot) => {
        todosClientes = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            for (let key in data) {
                todosClientes.push({ id: key, ...data[key] });
            }
        }
        todosClientes.sort((a, b) => a.nome.localeCompare(b.nome));
        atualizarSelectClientes();
        if(!document.getElementById('catalogo-screen').classList.contains('hidden')) renderCatalogo();
    });
}

// --- CADASTRO E CATÁLOGO DE CLIENTES ---
document.getElementById('cadastro-cliente-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('cad-cli-nome').value.toUpperCase();
    const endereco = document.getElementById('cad-cli-endereco').value;
    const telefone = document.getElementById('cad-cli-telefone').value;

    const cliente = { nome, endereco, telefone, timestamp: getBrasiliaDate().getTime() };

    await push(ref(database, 'clientes'), cliente);
    alert("Cliente cadastrado com sucesso!");
    e.target.reset();
    showScreen('dashboard-screen');
});

function atualizarSelectClientes() {
    const select = document.getElementById('cad-cliente');
    const valorAtual = select.value;
    select.innerHTML = '<option value="">-- Selecione o Cliente --</option>';
    todosClientes.forEach(cli => {
        select.innerHTML += `<option value="${cli.nome}">${cli.nome}</option>`;
    });
    if (valorAtual) select.value = valorAtual;
}

function renderCatalogo() {
    const filtroNome = document.getElementById('filtro-nome-cliente').value.toUpperCase();
    const tbody = document.querySelector('#tabela-catalogo tbody');
    tbody.innerHTML = "";

    todosClientes.filter(cli => cli.nome.includes(filtroNome)).forEach(cli => {
        tbody.innerHTML += `
            <tr>
                <td>${cli.nome}</td>
                <td>${cli.endereco || '-'}</td>
                <td>${cli.telefone || '-'}</td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn btn--sm btn--edit" onclick="abrirEdicaoCliente('${cli.id}')">Editar</button>
                        <button class="btn btn--sm btn--delete" onclick="abrirExclusaoCliente('${cli.id}')">Excluir</button>
                    </div>
                </td>
            </tr>
        `;
    });
}
document.getElementById('filtro-nome-cliente').addEventListener('input', renderCatalogo);

// --- EDIÇÃO E EXCLUSÃO DE CLIENTES ---
window.abrirEdicaoCliente = (id) => {
    const cli = todosClientes.find(c => c.id === id);
    if (!cli) return;
    document.getElementById('edit-cli-id').value = cli.id;
    document.getElementById('edit-cli-nome').value = cli.nome;
    document.getElementById('edit-cli-endereco').value = cli.endereco || '';
    document.getElementById('edit-cli-telefone').value = cli.telefone || '';
    document.getElementById('edit-cliente-modal').classList.remove('hidden');
};

document.getElementById('edit-cliente-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-cli-id').value;
    const nome = document.getElementById('edit-cli-nome').value.toUpperCase();
    const endereco = document.getElementById('edit-cli-endereco').value;
    const telefone = document.getElementById('edit-cli-telefone').value;

    await update(ref(database, `clientes/${id}`), { nome, endereco, telefone });
    alert("Cliente atualizado com sucesso!");
    document.getElementById('edit-cliente-modal').classList.add('hidden');
    renderCatalogo();
});

window.abrirExclusaoCliente = (id) => {
    document.getElementById('delete-cliente-id').value = id;
    document.getElementById('delete-cliente-modal').classList.remove('hidden');
};

document.getElementById('btn-confirmar-exclusao-cliente').onclick = async () => {
    const id = document.getElementById('delete-cliente-id').value;
    if (!id) return;

    try {
        await remove(ref(database, `clientes/${id}`));
        alert("Cliente excluído com sucesso!");
        document.getElementById('delete-cliente-modal').classList.add('hidden');
        renderCatalogo();
    } catch (err) {
        alert("Erro ao excluir cliente.");
    }
};

// --- PESQUISA DE CLIENTE NA TELA DE CADASTRO DE CONTRATO ---
const searchClienteInput = document.getElementById('search-cliente-input');
const autocompleteResults = document.getElementById('autocomplete-results');
const selectClienteCad = document.getElementById('cad-cliente');
const btnPesquisarClienteCad = document.getElementById('btn-pesquisar-cliente-cad');

function filtrarEExibirClientes(termo) {
    const filtro = termo.trim().toUpperCase();
    autocompleteResults.innerHTML = "";
    
    if (!filtro) {
        autocompleteResults.classList.add('hidden');
        return;
    }

    const filtrados = todosClientes.filter(c => c.nome.includes(filtro));
    if (filtrados.length === 0) {
        autocompleteResults.innerHTML = `<div class="autocomplete-item text-center">Nenhum cliente encontrado</div>`;
    } else {
        filtrados.forEach(c => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.textContent = c.nome;
            item.onclick = () => selecionarClientePorNome(c.nome);
            autocompleteResults.appendChild(item);
        });
    }
    autocompleteResults.classList.remove('hidden');
}

function selecionarClientePorNome(nome) {
    searchClienteInput.value = nome;
    selectClienteCad.value = nome;
    autocompleteResults.classList.add('hidden');
}

searchClienteInput.addEventListener('input', (e) => {
    filtrarEExibirClientes(e.target.value);
});
btnPesquisarClienteCad.addEventListener('click', () => {
    filtrarEExibirClientes(searchClienteInput.value);
});
selectClienteCad.addEventListener('change', (e) => {
    searchClienteInput.value = e.target.value;
    autocompleteResults.classList.add('hidden');
});
document.addEventListener('click', (e) => {
    if (!e.target.closest('.autocomplete-container')) {
        autocompleteResults.classList.add('hidden');
    }
});

function resetCadastroContratoForm() {
    document.getElementById('cadastro-form').reset();
    document.getElementById('cad-parcelas-container').innerHTML = "";
    searchClienteInput.value = "";
    autocompleteResults.classList.add('hidden');
}

// --- CADASTRO CONTRATOS & CÁLCULO DA PARCELA ---
function calcularValorParcela() {
    const qtd = parseInt(document.getElementById('cad-parcelas').value) || 0;
    const total = parseFloat(document.getElementById('cad-valor').value) || 0;
    const entrada = parseFloat(document.getElementById('cad-entrada').value) || 0;

    const valorAposEntrada = Math.max(0, total - entrada);
    document.getElementById('cad-valor-parcela').value = qtd > 0 ? (valorAposEntrada / qtd).toFixed(2) : "";
}

document.getElementById('cad-parcelas').addEventListener('input', () => { calcularValorParcela(); gerarCamposParcelas(); });
document.getElementById('cad-valor').addEventListener('input', () => { calcularValorParcela(); if (parseInt(document.getElementById('cad-parcelas').value) > 0) gerarCamposParcelas(); });
document.getElementById('cad-entrada').addEventListener('input', () => { calcularValorParcela(); });

function gerarCamposParcelas() {
    const qtd = parseInt(document.getElementById('cad-parcelas').value) || 0;
    calcularValorParcela();
    
    const container = document.getElementById('cad-parcelas-container');
    container.innerHTML = "";
    for(let i = 1; i <= qtd; i++) {
        container.innerHTML += `
            <div class="parcela-row">
                <label>Parcela ${i}</label>
                <input type="date" class="form-control cad-prazo" data-index="${i-1}" required>
                <label><input type="checkbox" class="cad-pago"> Pago?</label>
            </div>
        `;
    }

    const primeiraPrazoInput = container.querySelector('.cad-prazo');
    if (primeiraPrazoInput) {
        const atualizarPrazosSubsequentes = () => {
            const dataBase = primeiraPrazoInput.value;
            if (!dataBase) return;

            const todosPrazos = container.querySelectorAll('.cad-prazo');
            todosPrazos.forEach((input, index) => {
                if (index > 0) input.value = somarMesesData(dataBase, index);
            });
        };
        primeiraPrazoInput.addEventListener('input', atualizarPrazosSubsequentes);
        primeiraPrazoInput.addEventListener('change', atualizarPrazosSubsequentes);
    }
}

document.getElementById('cadastro-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const valorParcelaBase = parseFloat(document.getElementById('cad-valor-parcela').value);
    const parcelasDOM = document.querySelectorAll('#cad-parcelas-container .parcela-row');
    let parcelas = [];
    
    parcelasDOM.forEach((row, i) => {
        let isPago = row.querySelector('.cad-pago').checked;
        parcelas.push({
            numero: i + 1,
            prazo: row.querySelector('.cad-prazo').value,
            paga: isPago,
            valorOriginal: valorParcelaBase,
            valorEsperado: valorParcelaBase,
            valorPago: isPago ? valorParcelaBase : 0,
            diffAplicada: false
        });
    });

    const now = getBrasiliaDate();
    const contrato = {
        cliente: document.getElementById('cad-cliente').value,
        titulo: document.getElementById('cad-titulo').value,
        valorTotal: parseFloat(document.getElementById('cad-valor').value),
        valorEntrada: parseFloat(document.getElementById('cad-entrada').value) || 0,
        numeroParcelas: parseInt(document.getElementById('cad-parcelas').value),
        valorParcela: valorParcelaBase, // mantido para compatibilidade base
        observacao: "", // novo campo
        dataCriacao: formatPtBr(now),
        horaCriacao: now.toLocaleTimeString('pt-BR'),
        timestamp: now.getTime(),
        parcelas: parcelas
    };

    await push(ref(database, 'contratos'), contrato);
    alert("Contrato cadastrado com sucesso!");
    resetCadastroContratoForm();
    showScreen('dashboard-screen');
});

// --- LÓGICA COMPARTILHADA DE RENDERIZAÇÃO DE PARCELAS PARA EDIÇÃO ---
function getStatusSituacao(p) {
    if(p.paga) {
        return (p.valorPago < p.valorEsperado) ? "Paga Parc." : "Pago";
    }
    return (p.prazo < getTodayStringISO()) ? "Atrasado" : "Aberto";
}

function renderParcelasEditModal(contrato, containerId, prefix) {
    const container = document.getElementById(containerId);
    let html = "";
    
    contrato.parcelas.forEach((p, idx) => {
        let sit = getStatusSituacao(p);
        let sitClass = p.paga ? (p.valorPago < p.valorEsperado ? 'text-warning' : 'text-success') : (sit === 'Atrasado' ? 'text-error' : 'text-primary');

        html += `
            <div class="parcela-row" style="flex-wrap: wrap; align-items: flex-end; padding: 10px; margin-bottom:10px;" data-idx="${idx}">
                <div style="width: 100%; display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <label style="font-weight:bold; font-size: 13px;">Parcela ${p.numero} - <span class="${sitClass}">${sit}</span></label>
                    <span style="font-size:11px; color:var(--color-text-secondary);">Original: R$ ${p.valorOriginal.toFixed(2)}</span>
                </div>
                
                <input type="hidden" class="${prefix}-original" value="${p.valorOriginal}">
                <input type="hidden" class="${prefix}-esperado-hidden" value="${p.valorEsperado}">
                <input type="hidden" class="${prefix}-diff-aplicada" value="${p.diffAplicada ? 'true' : 'false'}">

                <div style="display:flex; gap: 10px; width: 100%; align-items: center; flex-wrap:wrap;">
                    <div style="flex:1; min-width:120px;">
                        <span style="font-size:10px;">Prazo</span>
                        <input type="date" class="form-control ${prefix}-prazo" value="${p.prazo}" required>
                    </div>

                    <div style="display:flex; flex-direction:column;">
                        <span style="font-size:10px;">Esperado (R$)</span>
                        <input type="number" step="0.01" class="form-control ${prefix}-esperado" value="${p.valorEsperado.toFixed(2)}" readonly style="width: 90px; background:var(--color-bg-1);">
                    </div>

                    <div style="display:flex; flex-direction:column;">
                        <span style="font-size:10px;">Pago (R$)</span>
                        <input type="number" step="0.01" class="form-control ${prefix}-pago-valor" value="${p.valorPago > 0 ? p.valorPago.toFixed(2) : ''}" style="width: 90px;">
                    </div>

                    <label style="display:flex; align-items:center; gap:4px; margin-top: 15px;">
                        <input type="checkbox" class="${prefix}-pago-chk" ${p.paga ? 'checked' : ''}> Pago?
                    </label>
                </div>

                <div class="${prefix}-diff-container diff-container hidden">
                    <span style="font-size:11px; color: var(--color-warning);">Pagamento inferior. Ação para a diferença:</span>
                    <select class="form-control diff-acao-select ${prefix}-diff-acao">
                        <option value="final">Nova parcela no Final</option>
                        <option value="proxima">Na próxima parcela</option>
                        <option value="dividir">Dividir entre as próximas</option>
                    </select>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;

    // Adicionando eventos dinâmicos para resumo e verificação de diferença
    const rows = container.querySelectorAll('.parcela-row');
    rows.forEach(row => {
        const chk = row.querySelector(`.${prefix}-pago-chk`);
        const inputPago = row.querySelector(`.${prefix}-pago-valor`);
        const inputEsp = row.querySelector(`.${prefix}-esperado-hidden`);
        const diffCont = row.querySelector(`.${prefix}-diff-container`);
        const diffAplicada = row.querySelector(`.${prefix}-diff-aplicada`).value === 'true';

        const checkDiff = () => {
            let pago = parseFloat(inputPago.value) || 0;
            let esp = parseFloat(inputEsp.value) || 0;
            // Se já não foi aplicada e é pago parcial
            if(chk.checked && pago > 0 && pago < esp && !diffAplicada) {
                diffCont.classList.remove('hidden');
            } else {
                diffCont.classList.add('hidden');
            }
            atualizarResumoModal(container.closest('.modal-body'), contrato.valorTotal, prefix);
        };

        chk.addEventListener('change', () => {
            if(chk.checked && !inputPago.value) {
                inputPago.value = parseFloat(inputEsp.value).toFixed(2);
            }
            if(!chk.checked) inputPago.value = '';
            checkDiff();
        });
        
        inputPago.addEventListener('input', () => {
            if(parseFloat(inputPago.value) > 0) chk.checked = true;
            checkDiff();
        });
        
        // Dispara initial check
        checkDiff();
    });
}

function atualizarResumoModal(modalBody, valorTotalContrato, prefix) {
    const inputsPago = modalBody.querySelectorAll(`.${prefix}-pago-valor`);
    let totalPago = 0;
    inputsPago.forEach(inp => {
        let chk = inp.closest('.parcela-row').querySelector(`.${prefix}-pago-chk`);
        if(chk.checked) totalPago += (parseFloat(inp.value) || 0);
    });
    
    let devido = Math.max(0, valorTotalContrato - totalPago);

    modalBody.querySelector('.resumo-original').textContent = valorTotalContrato.toFixed(2);
    modalBody.querySelector('.resumo-pago').textContent = totalPago.toFixed(2);
    modalBody.querySelector('.resumo-devido').textContent = devido.toFixed(2);
}

// Lógica de Processamento de Diferenças ao Salvar
function extrairEProcessarParcelas(containerId, prefix, contrato) {
    const rows = document.getElementById(containerId).querySelectorAll('.parcela-row');
    let memParcelas = [];

    // Extrair do DOM
    rows.forEach((row, i) => {
        let oldP = contrato.parcelas[i];
        let numStr = oldP ? oldP.numero : (i + 1);
        memParcelas.push({
            numero: numStr,
            prazo: row.querySelector(`.${prefix}-prazo`).value,
            valorOriginal: parseFloat(row.querySelector(`.${prefix}-original`).value),
            valorEsperado: parseFloat(row.querySelector(`.${prefix}-esperado-hidden`).value),
            valorPago: row.querySelector(`.${prefix}-pago-chk`).checked ? (parseFloat(row.querySelector(`.${prefix}-pago-valor`).value) || 0) : 0,
            paga: row.querySelector(`.${prefix}-pago-chk`).checked,
            diffAplicada: row.querySelector(`.${prefix}-diff-aplicada`).value === 'true',
            acaoDiff: row.querySelector(`.${prefix}-diff-acao`).value,
            isExtraFinal: oldP ? (oldP.isExtraFinal || false) : false
        });
    });

    // Processar propagações
    for(let i=0; i<memParcelas.length; i++) {
        let p = memParcelas[i];
        
        // Verifica se é um pagamento parcial e a diferença ainda não foi propagada
        if(p.paga && p.valorPago > 0 && p.valorPago < p.valorEsperado && !p.diffAplicada) {
            let diff = p.valorEsperado - p.valorPago;
            p.diffAplicada = true; // Marca que este desfalque foi repassado adiante

            if(p.acaoDiff === 'proxima') {
                if(i + 1 < memParcelas.length) {
                    memParcelas[i+1].valorEsperado += diff;
                } else {
                    memParcelas.push(criarNovaParcela(memParcelas, diff));
                }
            } else if (p.acaoDiff === 'dividir') {
                let restantes = memParcelas.length - 1 - i;
                if(restantes > 0) {
                    let adicao = diff / restantes;
                    for(let j=i+1; j<memParcelas.length; j++) {
                        memParcelas[j].valorEsperado += adicao;
                    }
                } else {
                    memParcelas.push(criarNovaParcela(memParcelas, diff));
                }
            } else if (p.acaoDiff === 'final') {
                let parcelaExtra = memParcelas.find(x => x.isExtraFinal);
                if(parcelaExtra) {
                    parcelaExtra.valorEsperado += diff;
                    parcelaExtra.valorOriginal += diff;
                } else {
                    let nova = criarNovaParcela(memParcelas, diff);
                    nova.isExtraFinal = true;
                    memParcelas.push(nova);
                }
            }
        }
    }

    // Limpar propriedades temporárias da interface
    memParcelas.forEach(p => delete p.acaoDiff);
    return memParcelas;
}

function criarNovaParcela(memParcelas, diff) {
    let ultimaData = memParcelas[memParcelas.length-1].prazo;
    let novaData = somarMesesData(ultimaData, 1);
    
    // Calcula o próximo número
    let ultimoNum = memParcelas[memParcelas.length-1].numero;
    let proxNum = typeof ultimoNum === 'number' ? (ultimoNum + 1) : (memParcelas.length + 1);

    return {
        numero: proxNum,
        prazo: novaData,
        valorOriginal: diff,
        valorEsperado: diff,
        valorPago: 0,
        paga: false,
        diffAplicada: false
    };
}

// --- PESQUISA CLIENTES (CONTRATOS) ---
document.getElementById('btn-pesquisar-cliente').onclick = () => {
    const nome = document.getElementById('pesquisa-cliente-nome').value.toUpperCase();
    const tbody = document.querySelector('#tabela-pesquisa-cliente tbody');
    tbody.innerHTML = "";

    const contratosFiltrados = todosContratos.filter(c => c.cliente.includes(nome));

    if (contratosFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center">Nenhum contrato encontrado.</td></tr>`;
        return;
    }

    contratosFiltrados.forEach(contrato => {
        let proximaParcela = contrato.parcelas.find(p => !p.paga);
        let proximaPrazoStr = "-";
        
        if (proximaParcela) {
            proximaPrazoStr = formatPtBr(new Date(proximaParcela.prazo + "T12:00:00Z"));
        } else if (contrato.parcelas.length > 0) {
            let ultima = contrato.parcelas[contrato.parcelas.length - 1];
            proximaPrazoStr = formatPtBr(new Date(ultima.prazo + "T12:00:00Z")) + " (Quitado)";
        }

        let emAberto = contrato.parcelas.some(p => !p.paga && p.prazo >= getTodayStringISO());
        let atrasado = contrato.parcelas.some(p => !p.paga && p.prazo < getTodayStringISO());
        let situacaoContrato = atrasado ? "Atrasado" : (emAberto ? "Aberto" : "Pago");

        tbody.innerHTML += `
            <tr>
                <td><button class="btn btn--sm btn--primary" onclick="abrirModalParcelas('${contrato.id}')" title="Ver Parcelas">+</button></td>
                <td>${contrato.cliente}</td>
                <td>${contrato.titulo || '-'}</td>
                <td>R$ ${contrato.valorTotal.toFixed(2)}</td>
                <td>${contrato.parcelas.length}</td>
                <td>${proximaPrazoStr}</td>
                <td>${situacaoContrato}</td>
            </tr>
        `;
    });
};

window.abrirModalParcelas = (contratoId) => {
    const contrato = todosContratos.find(c => c.id === contratoId);
    if (!contrato) return;

    document.getElementById('modal-contrato-id').value = contrato.id;
    document.getElementById('modal-entrada').value = contrato.valorEntrada || 0;
    document.getElementById('modal-observacao').value = contrato.observacao || '';
    document.getElementById('modal-parcelas-titulo').textContent = `Parcelas do Contrato: ${contrato.titulo || 'Sem Título'} (${contrato.cliente})`;

    renderParcelasEditModal(contrato, 'modal-parcelas-container', 'modal');
    document.getElementById('parcelas-modal').classList.remove('hidden');
};

document.getElementById('parcelas-modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const contratoId = document.getElementById('modal-contrato-id').value;
    const contrato = todosContratos.find(c => c.id === contratoId);
    const novaEntrada = parseFloat(document.getElementById('modal-entrada').value) || 0;
    const obs = document.getElementById('modal-observacao').value;
    
    const novasParcelas = extrairEProcessarParcelas('modal-parcelas-container', 'modal', contrato);

    let alteracoes = {};
    alteracoes[`contratos/${contratoId}/valorEntrada`] = novaEntrada;
    alteracoes[`contratos/${contratoId}/observacao`] = obs;
    alteracoes[`contratos/${contratoId}/parcelas`] = novasParcelas;

    await update(ref(database), alteracoes);
    alert("Contrato e parcelas atualizados com sucesso!");
    document.getElementById('parcelas-modal').classList.add('hidden');
    document.getElementById('btn-pesquisar-cliente').click();
});

// --- BASE DE DADOS E EDIÇÃO / EXCLUSÃO DE CONTRATOS ---
function renderBaseDados() {
    const statusFiltro = document.getElementById('filtro-situacao').value;
    const dataFiltro = document.getElementById('filtro-data').value;
    const tbody = document.querySelector('#tabela-basedados tbody');
    tbody.innerHTML = "";

    todosContratos.forEach(c => {
        let emAberto = c.parcelas.some(p => !p.paga && p.prazo >= getTodayStringISO());
        let atrasado = c.parcelas.some(p => !p.paga && p.prazo < getTodayStringISO());
        let situacaoGeral = atrasado ? "Atrasado" : (emAberto ? "Aberto" : "Pago");
        
        let passaFiltroSituacao = statusFiltro === "" || statusFiltro === situacaoGeral;
        let passaFiltroData = dataFiltro === "" || c.dataCriacao === formatPtBr(new Date(dataFiltro + "T12:00:00Z"));

        if (passaFiltroSituacao && passaFiltroData) {
            tbody.innerHTML += `
                <tr>
                    <td>${c.dataCriacao} ${c.horaCriacao}</td>
                    <td>${c.cliente}</td>
                    <td>${c.titulo || '-'}</td>
                    <td>R$ ${c.valorTotal.toFixed(2)}</td>
                    <td>${c.parcelas.length}</td>
                    <td>${situacaoGeral}</td>
                    <td>
                        <div style="display: flex; gap: 5px;">
                            <button class="btn btn--sm btn--primary" onclick="abrirEdicao('${c.id}')">Editar</button>
                            <button class="btn btn--sm btn--danger" style="background: var(--color-error); color: white;" onclick="abrirExclusao('${c.id}')">Excluir</button>
                        </div>
                    </td>
                </tr>
            `;
        }
    });
}
document.getElementById('filtro-situacao').onchange = renderBaseDados;
document.getElementById('filtro-data').onchange = renderBaseDados;

window.abrirEdicao = (id) => {
    const c = todosContratos.find(x => x.id === id);
    document.getElementById('edit-id').value = c.id;
    document.getElementById('edit-cliente').value = c.cliente;
    document.getElementById('edit-titulo').value = c.titulo || '';
    document.getElementById('edit-entrada').value = c.valorEntrada || 0;
    document.getElementById('edit-observacao').value = c.observacao || '';
    
    renderParcelasEditModal(c, 'edit-parcelas-container', 'edit');
    document.getElementById('edit-modal').classList.remove('hidden');
};

document.getElementById('edit-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const c = todosContratos.find(x => x.id === id);
    
    const novoTitulo = document.getElementById('edit-titulo').value;
    const novaEntrada = parseFloat(document.getElementById('edit-entrada').value) || 0;
    const obs = document.getElementById('edit-observacao').value;

    const novasParcelas = extrairEProcessarParcelas('edit-parcelas-container', 'edit', c);
    
    let atualizacao = {};
    atualizacao[`contratos/${id}/titulo`] = novoTitulo;
    atualizacao[`contratos/${id}/valorEntrada`] = novaEntrada;
    atualizacao[`contratos/${id}/observacao`] = obs;
    atualizacao[`contratos/${id}/parcelas`] = novasParcelas;

    await update(ref(database), atualizacao);
    document.getElementById('edit-modal').classList.add('hidden');
    alert("Contrato salvo e atualizado!");
};

window.abrirExclusao = (id) => {
    document.getElementById('delete-id').value = id;
    document.getElementById('delete-modal').classList.remove('hidden');
};

document.getElementById('btn-confirmar-exclusao').onclick = async () => {
    const id = document.getElementById('delete-id').value;
    if (!id) return;
    try {
        await remove(ref(database, `contratos/${id}`));
        alert("Entrada excluída com sucesso da base de dados!");
        document.getElementById('delete-modal').classList.add('hidden');
        renderBaseDados();
    } catch (err) {
        alert("Erro ao excluir entrada.");
    }
};

// --- PESQUISA POR DATA (MARCAÇÃO RÁPIDA DE PAGAMENTO INTEGRAL) ---
document.getElementById('btn-pesquisar-data').onclick = () => {
    const dataBusca = document.getElementById('pesquisa-data-input').value;
    const tbody = document.querySelector('#tabela-pesquisa-data tbody');
    tbody.innerHTML = "";
    
    if(!dataBusca) {
        return alert("Por favor, selecione uma data.");
    }

    todosContratos.forEach(contrato => {
        contrato.parcelas.forEach((p, index) => {
            if (p.prazo === dataBusca) {
                const sit = getStatusSituacao(p);
                tbody.innerHTML += `
                    <tr>
                        <td><input type="checkbox" class="chk-pesquisa-data" data-id="${contrato.id}" data-idx="${index}" ${p.paga ? 'checked' : ''}></td>
                        <td>${contrato.cliente}</td>
                        <td>${contrato.titulo || '-'}</td>
                        <td>R$ ${contrato.valorTotal.toFixed(2)}</td>
                        <td>${p.numero}</td>
                        <td>${formatPtBr(new Date(p.prazo + "T12:00:00Z"))}</td>
                        <td>${sit}</td>
                    </tr>
                `;
            }
        });
    });
};

document.getElementById('btn-salvar-pesquisa-data').onclick = async () => {
    const checks = document.querySelectorAll('.chk-pesquisa-data');
    let alteracoes = {};
    checks.forEach(chk => {
        let cid = chk.dataset.id;
        let idx = chk.dataset.idx;
        let contrato = todosContratos.find(c => c.id === cid);
        let parcela = contrato.parcelas[idx];
        
        alteracoes[`contratos/${cid}/parcelas/${idx}/paga`] = chk.checked;
        if(chk.checked && (!parcela.valorPago || parcela.valorPago === 0)) {
            alteracoes[`contratos/${cid}/parcelas/${idx}/valorPago`] = parcela.valorEsperado; // pagamento integral rapido
        }
    });
    await update(ref(database), alteracoes);
    alert("Alterações salvas!");
    document.getElementById('btn-pesquisar-data').click();
};


// --- ESTATÍSTICA E DASHBOARD ---
function calcularEstatisticas() {
    let pagas = 0, abertos = 0, atrasados = 0;
    let vencemHoje = 0;
    let hojeISO = getTodayStringISO();

    todosContratos.forEach(c => {
        let contratoTemAberto = false;
        c.parcelas.forEach(p => {
            if (p.paga) pagas++; // Conta também pagas parcialmente como pagas nas estatisticas globais de quantidade
            else {
                if (p.prazo < hojeISO) atrasados++;
                else contratoTemAberto = true;
                
                if (p.prazo === hojeISO) vencemHoje++;
            }
        });
        if (contratoTemAberto) abertos++;
    });

    document.getElementById('alert-atrasados').textContent = atrasados;
    document.getElementById('alert-hoje').textContent = vencemHoje;

    document.getElementById('est-pagas').textContent = pagas;
    document.getElementById('est-abertos').textContent = abertos;
    document.getElementById('est-atrasados').textContent = atrasados;
}

// --- CÁLCULO DE FATURAMENTO MENSAL ---
function calcularFaturamentoMensal() {
    const mesAno = document.getElementById('faturamento-mes-select').value;
    if (!mesAno) return;

    let totalPago = 0;
    let qtdPagas = 0;
    let totalPendente = 0;
    let qtdPendentes = 0;

    todosContratos.forEach(c => {
        c.parcelas.forEach(p => {
            if (p.prazo && p.prazo.startsWith(mesAno)) {
                if (p.paga) {
                    totalPago += (p.valorPago || 0);
                    qtdPagas++;
                    // Se foi parcial, a diferença pendente deve ser contabilizada para o futuro? 
                    // Como foi diluida, aparecerá no mes de cobrança referente ao repasse.
                } else {
                    totalPendente += (p.valorEsperado || 0);
                    qtdPendentes++;
                }
            }
        });
    });

    document.getElementById('fat-pago-valor').textContent = `R$ ${totalPago.toFixed(2)}`;
    document.getElementById('fat-pago-qtd').textContent = `${qtdPagas} parcela(s) com pgto.`;

    document.getElementById('fat-pendente-valor').textContent = `R$ ${totalPendente.toFixed(2)}`;
    document.getElementById('fat-pendente-qtd').textContent = `${qtdPendentes} parcela(s) não pagas`;
}

document.getElementById('faturamento-mes-select').addEventListener('change', calcularFaturamentoMensal);

function renderEstatistica() {
    const mesSelect = document.getElementById('faturamento-mes-select');
    if (!mesSelect.value) {
        mesSelect.value = getCurrentMonthISO();
    }
    calcularFaturamentoMensal();

    const tbody = document.querySelector('#tabela-atrasos tbody');
    let listaAtrasos = [];
    const hoje = getBrasiliaDate();
    hoje.setHours(0,0,0,0);

    todosContratos.forEach(c => {
        c.parcelas.forEach((p, index) => {
            const dataPrazo = new Date(p.prazo + "T12:00:00Z");
            dataPrazo.setHours(0,0,0,0);
            
            // Só é atrasado se não está paga de forma alguma (Paga ou Parc. Paga não contam como atraso)
            if (!p.paga && dataPrazo < hoje) {
                const diasAtraso = Math.floor((hoje - dataPrazo) / (1000 * 60 * 60 * 24));
                listaAtrasos.push({
                    contratoId: c.id,
                    parcelaIndex: index,
                    cliente: c.cliente,
                    titulo: c.titulo,
                    total: c.valorTotal,
                    num: p.numero,
                    valorEsperado: p.valorEsperado,
                    entrada: c.valorEntrada || 0,
                    prazoStr: formatPtBr(dataPrazo),
                    dias: diasAtraso
                });
            }
        });
    });

    listaAtrasos.sort((a, b) => sortDiasDesc ? b.dias - a.dias : a.dias - b.dias);
    
    if (listaAtrasos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center">Nenhuma parcela em atraso!</td></tr>`;
        return;
    }

    tbody.innerHTML = listaAtrasos.map(item => `
        <tr>
            <td>${item.cliente}</td>
            <td>${item.titulo || '-'}</td>
            <td>R$ ${item.total.toFixed(2)}</td>
            <td>${item.num}</td>
            <td>R$ ${item.valorEsperado.toFixed(2)}</td>
            <td>R$ ${item.entrada.toFixed(2)}</td>
            <td>${item.prazoStr}</td>
            <td class="text-error"><strong>${item.dias}</strong></td>
            <td class="text-center">
                <input type="checkbox" class="chk-atraso-pago" data-id="${item.contratoId}" data-idx="${item.parcelaIndex}" style="width:18px; height:18px; cursor:pointer;">
            </td>
        </tr>
    `).join('');
}

document.getElementById('sort-dias').onclick = () => {
    sortDiasDesc = !sortDiasDesc;
    renderEstatistica();
};

document.getElementById('btn-salvar-atrasos').onclick = async () => {
    const checkboxes = document.querySelectorAll('.chk-atraso-pago');
    let alteracoes = {};
    let marcados = 0;

    checkboxes.forEach(chk => {
        if (chk.checked) {
            let cid = chk.dataset.id;
            let idx = chk.dataset.idx;
            let contrato = todosContratos.find(c => c.id === cid);
            
            alteracoes[`contratos/${cid}/parcelas/${idx}/paga`] = true;
            alteracoes[`contratos/${cid}/parcelas/${idx}/valorPago`] = contrato.parcelas[idx].valorEsperado; // marca rápida paga integral
            marcados++;
        }
    });

    if (marcados === 0) {
        alert("Nenhuma parcela foi marcada como paga.");
        return;
    }

    await update(ref(database), alteracoes);
    alert(`${marcados} parcela(s) atualizada(s) para paga(s)!`);
    renderEstatistica();
    calcularEstatisticas();
};