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

// --- VERIFICAÇÃO DE CONEXÃO COM O FIREBASE ---
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

// --- FUNÇÕES DE TEMPO UTC-3 ---
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

// Função para somar meses mantendo a integridade da data (YYYY-MM-DD)
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

// Atalho do Dashboard para Estatísticas (Aviso de Atrasados)
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
                todosContratos.push({ id: key, ...data[key] });
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

// --- CADASTRO CONTRATOS & CÁLCULO DA PARCELA COM ENTRADA ---
function calcularValorParcela() {
    const qtd = parseInt(document.getElementById('cad-parcelas').value) || 0;
    const total = parseFloat(document.getElementById('cad-valor').value) || 0;
    const entrada = parseFloat(document.getElementById('cad-entrada').value) || 0;

    const valorAposEntrada = Math.max(0, total - entrada);
    document.getElementById('cad-valor-parcela').value = qtd > 0 ? (valorAposEntrada / qtd).toFixed(2) : "";
}

document.getElementById('cad-parcelas').addEventListener('input', () => {
    calcularValorParcela();
    gerarCamposParcelas();
});

document.getElementById('cad-valor').addEventListener('input', () => {
    calcularValorParcela();
    if (parseInt(document.getElementById('cad-parcelas').value) > 0) {
        gerarCamposParcelas();
    }
});

document.getElementById('cad-entrada').addEventListener('input', () => {
    calcularValorParcela();
});

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
                if (index > 0) {
                    input.value = somarMesesData(dataBase, index);
                }
            });
        };

        primeiraPrazoInput.addEventListener('input', atualizarPrazosSubsequentes);
        primeiraPrazoInput.addEventListener('change', atualizarPrazosSubsequentes);
    }
}

document.getElementById('cadastro-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const parcelasDOM = document.querySelectorAll('#cad-parcelas-container .parcela-row');
    let parcelas = [];
    
    parcelasDOM.forEach((row, i) => {
        parcelas.push({
            numero: i + 1,
            prazo: row.querySelector('.cad-prazo').value,
            paga: row.querySelector('.cad-pago').checked
        });
    });

    const now = getBrasiliaDate();
    const contrato = {
        cliente: document.getElementById('cad-cliente').value,
        titulo: document.getElementById('cad-titulo').value,
        valorTotal: parseFloat(document.getElementById('cad-valor').value),
        valorEntrada: parseFloat(document.getElementById('cad-entrada').value) || 0,
        numeroParcelas: parseInt(document.getElementById('cad-parcelas').value),
        valorParcela: parseFloat(document.getElementById('cad-valor-parcela').value),
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
                <td>${contrato.numeroParcelas}</td>
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
    document.getElementById('modal-parcelas-titulo').textContent = `Parcelas do Contrato: ${contrato.titulo || 'Sem Título'} (${contrato.cliente})`;

    let html = "";
    contrato.parcelas.forEach((p, idx) => {
        const sit = p.paga ? "Pago" : (p.prazo < getTodayStringISO() ? "Atrasado" : "Aberto");
        html += `
            <div class="parcela-row">
                <label>Parc ${p.numero}</label>
                <input type="date" class="form-control modal-prazo" data-idx="${idx}" value="${p.prazo}" required>
                <label><input type="checkbox" class="modal-pago" data-idx="${idx}" ${p.paga ? 'checked' : ''}> Pago?</label>
                <span class="status-indicator-text" style="font-size: 12px; font-weight: bold; margin-left: auto;">${sit}</span>
            </div>
        `;
    });

    document.getElementById('modal-parcelas-container').innerHTML = html;
    document.getElementById('parcelas-modal').classList.remove('hidden');
};

document.getElementById('parcelas-modal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const contratoId = document.getElementById('modal-contrato-id').value;
    const novaEntrada = parseFloat(document.getElementById('modal-entrada').value) || 0;
    const prazosDOM = document.querySelectorAll('.modal-prazo');
    const pagosDOM = document.querySelectorAll('.modal-pago');

    let alteracoes = {};
    alteracoes[`contratos/${contratoId}/valorEntrada`] = novaEntrada;

    prazosDOM.forEach((input, idx) => {
        alteracoes[`contratos/${contratoId}/parcelas/${idx}/prazo`] = input.value;
        alteracoes[`contratos/${contratoId}/parcelas/${idx}/paga`] = pagosDOM[idx].checked;
    });

    await update(ref(database), alteracoes);
    alert("Contrato e parcelas atualizados com sucesso!");
    document.getElementById('parcelas-modal').classList.add('hidden');
    document.getElementById('btn-pesquisar-cliente').click();
});

// --- PESQUISA POR DATA ---
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
                const sit = p.paga ? "Pago" : (p.prazo < getTodayStringISO() ? "Atrasado" : "Aberto");
                tbody.innerHTML += `
                    <tr>
                        <td><input type="checkbox" class="chk-pesquisa-data" data-id="${contrato.id}" data-idx="${index}" ${p.paga ? 'checked' : ''}></td>
                        <td>${contrato.cliente}</td>
                        <td>${contrato.titulo || '-'}</td>
                        <td>R$ ${contrato.valorTotal.toFixed(2)}</td>
                        <td>${p.numero} de ${contrato.numeroParcelas}</td>
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
        alteracoes[`contratos/${chk.dataset.id}/parcelas/${chk.dataset.idx}/paga`] = chk.checked;
    });
    await update(ref(database), alteracoes);
    alert("Alterações salvas!");
    document.getElementById('btn-pesquisar-data').click();
};

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
                    <td>${c.numeroParcelas}</td>
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
    
    let html = "";
    c.parcelas.forEach((p, i) => {
        html += `
            <div class="parcela-row">
                <label>Parc ${p.numero}</label>
                <input type="date" class="form-control edit-prazo" value="${p.prazo}" required>
                <label><input type="checkbox" class="edit-pago" ${p.paga ? 'checked' : ''}> Pago</label>
            </div>
        `;
    });
    document.getElementById('edit-parcelas-container').innerHTML = html;
    document.getElementById('edit-modal').classList.remove('hidden');
};

document.getElementById('edit-form').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const novoTitulo = document.getElementById('edit-titulo').value;
    const novaEntrada = parseFloat(document.getElementById('edit-entrada').value) || 0;
    const prazos = document.querySelectorAll('.edit-prazo');
    const pagos = document.querySelectorAll('.edit-pago');
    
    let atualizacao = {};
    atualizacao[`contratos/${id}/titulo`] = novoTitulo;
    atualizacao[`contratos/${id}/valorEntrada`] = novaEntrada;

    prazos.forEach((p, i) => {
        atualizacao[`contratos/${id}/parcelas/${i}/prazo`] = prazos[i].value;
        atualizacao[`contratos/${id}/parcelas/${i}/paga`] = pagos[i].checked;
    });

    await update(ref(database), atualizacao);
    document.getElementById('edit-modal').classList.add('hidden');
    alert("Salvo!");
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

// --- ESTATÍSTICA E DASHBOARD ---
function calcularEstatisticas() {
    let pagas = 0, abertos = 0, atrasados = 0;
    let vencemHoje = 0;
    let hojeISO = getTodayStringISO();

    todosContratos.forEach(c => {
        let contratoTemAberto = false;
        c.parcelas.forEach(p => {
            if (p.paga) pagas++;
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

function renderEstatistica() {
    const tbody = document.querySelector('#tabela-atrasos tbody');
    let listaAtrasos = [];
    const hoje = getBrasiliaDate();
    hoje.setHours(0,0,0,0);

    todosContratos.forEach(c => {
        c.parcelas.forEach((p, index) => {
            const dataPrazo = new Date(p.prazo + "T12:00:00Z");
            dataPrazo.setHours(0,0,0,0);
            
            if (!p.paga && dataPrazo < hoje) {
                const diasAtraso = Math.floor((hoje - dataPrazo) / (1000 * 60 * 60 * 24));
                listaAtrasos.push({
                    contratoId: c.id,
                    parcelaIndex: index,
                    cliente: c.cliente,
                    titulo: c.titulo,
                    total: c.valorTotal,
                    num: p.numero,
                    valor: c.valorParcela,
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
            <td>R$ ${item.valor.toFixed(2)}</td>
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
            alteracoes[`contratos/${chk.dataset.id}/parcelas/${chk.dataset.idx}/paga`] = true;
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