
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import 'bootstrap/dist/css/bootstrap.min.css';
import {
    Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import './App.css'; // Import a custom CSS file for styling

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const App = () => {
    // Form State
    const [consumo, setConsumo] = useState(1000);
    const [tarifa, setTarifa] = useState(0.75);
    const [estados, setEstados] = useState([]);
    const [cidades, setCidades] = useState([]);
    const [selectedEstado, setSelectedEstado] = useState('');
    const [selectedCidade, setSelectedCidade] = useState('');
    const [irradiacaoSolar, setIrradiacaoSolar] = useState(5.34); // Default HSP, will be updated by PVGIS

    // UI State
    const [analysis, setAnalysis] = useState(null);
    const [loading, setLoading] = useState(false);
    const [suggestedInverter, setSuggestedInverter] = useState('');

    // Fetches states from IBGE API
    useEffect(() => {
        axios.get('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome')
            .then(response => setEstados(response.data));
    }, []);

    // Fetches cities when a state is selected
    useEffect(() => {
        if (selectedEstado) {
            axios.get(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${selectedEstado}/municipios?orderBy=nome`)
                .then(response => setCidades(response.data));
        }
    }, [selectedEstado]);

    // Fetches HSP from PVGIS when a city is selected
    useEffect(() => {
        if (selectedCidade && cidades.length > 0) {
            const cidadeObj = cidades.find(c => c.nome === selectedCidade);
            if (cidadeObj && cidadeObj.latitude && cidadeObj.longitude) {
                const lat = cidadeObj.latitude;
                const lon = cidadeObj.longitude;
                const pvgisUrl = `https://re.jrc.ec.europa.eu/api/v5_2/seriescalc?lat=${lat}&lon=${lon}&startyear=2020&endyear=2020&outputformat=json`;

                axios.get(pvgisUrl)
                    .then(response => {
                        // PVGIS returns data in 'outputs' -> 'monthly' array
                        // We need the average daily radiation for the year. Let's assume 'H_avg' for now.
                        // A more robust solution would sum monthly values and divide by 12.
                        // For simplicity, let's try to find a yearly average or sum monthly and divide.
                        // PVGIS 'seriescalc' provides 'H_m' (monthly average daily global irradiation on the horizontal plane)
                        // Let's average H_m over the year.
                        const monthlyIrradiations = response.data.outputs.monthly.map(m => m.H_m);
                        const averageDailyIrradiation = monthlyIrradiations.reduce((sum, val) => sum + val, 0) / monthlyIrradiations.length;
                        setIrradiacaoSolar(averageDailyIrradiation);
                    })
                    .catch(error => {
                        console.error("Erro ao buscar dados do PVGIS:", error);
                        setIrradiacaoSolar(5.34); // Fallback to default if API fails
                    });
            }
        }
    }, [selectedCidade, cidades]);

    const handleSubmit = (e) => {
        e.preventDefault();
        setLoading(true);

        // Simulate a delay for a better user experience
        setTimeout(() => {
            const eficiencia = 0.80; // Eficiência do sistema (80%)
            const potenciaPorModulo = 560; // Potência de cada módulo em Watts

            // 1. Calcular a Energia Diária Necessária
            const energiaDiaria = consumo / 30;

            // 2. Calcular a Potência Ideal do Sistema (kWp)
            const potenciaIdealKWp = energiaDiaria / (irradiacaoSolar * (eficiencia));

            // 3. Converter a Potência para Watts (W)
            const potenciaEmWatts = potenciaIdealKWp * 1000;

            // 4. Calcular o Numero de Modulos Solares
            const numModulos = Math.ceil(potenciaEmWatts / potenciaPorModulo);

            // 5. Calcular a Potencia Real do Sistema (kWp)
            const potenciaFinal = (numModulos * potenciaPorModulo) / 1000;

            // 6. Estimar a Geracao Mensal Real
            const geracaoMensalReal = potenciaFinal * irradiacaoSolar * 30 * eficiencia;

            // Lógica para sugerir o inversor
            let inversorSugerido = '';
            if (potenciaFinal <= 3) {
                inversorSugerido = 'Inversor de 3 kW';
            } else if (potenciaFinal <= 5) {
                inversorSugerido = 'Inversor de 5 kW';
            } else if (potenciaFinal <= 8) {
                inversorSugerido = 'Inversor de 8 kW';
            } else if (potenciaFinal <= 10) {
                inversorSugerido = 'Inversor de 10 kW';
            } else {
                inversorSugerido = 'Inversor de >10 kW (Consultar especialista)';
            }

            // 7. Calcular a Area Minima de Instalacao
            const areaNecessaria = (numModulos * 2.7).toFixed(2);

            // Preço do Kit (mantido o valor de 1630 por kWp)
            const precoKit = potenciaFinal * 1630;

            // Economia Mensal (baseada na geração real e tarifa)
            const economiaMensalValor = geracaoMensalReal * tarifa;

            // Payback Calculation
            const paybackMeses = Math.ceil(precoKit / economiaMensalValor);
            const paybackAnos = Math.floor(paybackMeses / 12);
            const paybackMesesRestantes = paybackMeses % 12;

            // Financing simulation (mantido o cálculo existente)
            const juros = 0.025;
            const carenciaJuros = Math.pow(1 + juros, 3); // 90 days = 3 months
            const valorFinanciado = precoKit * carenciaJuros;

            const calcularParcela = (nParcelas) => {
                return (valorFinanciado * (juros * Math.pow(1 + juros, nParcelas))) / (Math.pow(1 + juros, nParcelas) - 1);
            };

            const financiamento = {
                p48: calcularParcela(48),
                p60: calcularParcela(60),
                p72: calcularParcela(72),
            };

            // Chart data for 25 years with payback (mantido o cálculo existente)
            const anosProjecao = 25;
            const labelsProjecao = Array.from({ length: anosProjecao + 1 }, (_, i) => `Ano ${i}`);
            const dataProjecao = [ -precoKit ]; // Start with negative investment

            for (let i = 1; i <= anosProjecao; i++) {
                const valorAnoAnterior = dataProjecao[i - 1];
                const lucroAnual = economiaMensalValor * 12;
                dataProjecao.push(valorAnoAnterior + lucroAnual);
            }

            const chartData = {
                labels: labelsProjecao,
                datasets: [{
                    label: 'Lucro Acumulado (R$)',
                    data: dataProjecao,
                    fill: true,
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    tension: 0.3
                }]
            };

            setAnalysis({
                numModulos,
                potenciaFinal: potenciaFinal.toFixed(2),
                areaNecessaria,
                precoKit: precoKit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                economiaMensal: economiaMensalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                economiaAnual: (economiaMensalValor * 12).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                paybackAnos,
                paybackMesesRestantes,
                financiamento,
                chartData,
                geracaoMensalReal: geracaoMensalReal.toFixed(2), // Adicionado para exibição
                inversorSugerido // Adicionado para exibição
            });

            setLoading(false);
        }, 1500);
    };

    return (
        <div className="app-container">
            <div className="form-section">
                <header className="app-header">
                    <a href="https://ibb.co/67d0p597">
                        <img src="https://i.ibb.co/v6t4r8y6/LOGO-HABIL-NOVO.jpg" alt="Logo" className="app-logo" />
                    </a>
                    <h2>Simulador Solar</h2>
                    <p>Preencha os dados e veja sua economia.</p>
                </header>
                <form onSubmit={handleSubmit} className="solar-form">
                    <div className="mb-3">
                        <label>Consumo Mensal (kWh)</label>
                        <input type="number" className="form-control" value={consumo} onChange={e => setConsumo(Number(e.target.value))} />
                    </div>
                    <div className="mb-3">
                        <label>Tarifa de Energia (R$/kWh)</label>
                        <input type="number" step="0.01" className="form-control" value={tarifa} onChange={e => setTarifa(Number(e.target.value))} />
                    </div>
                    <div className="mb-3">
                        <label>Estado</label>
                        <select className="form-select" onChange={e => { setSelectedEstado(e.target.value); setSelectedCidade(''); }} value={selectedEstado}>
                            <option value="">Selecione o Estado</option>
                            {estados.map(estado => <option key={estado.id} value={estado.sigla}>{estado.nome}</option>)}
                        </select>
                    </div>
                    <div className="mb-3">
                        <label>Município</label>
                        <select className="form-select" onChange={e => setSelectedCidade(e.target.value)} value={selectedCidade} disabled={!selectedEstado}>
                            <option value="">Selecione a Cidade</option>
                            {cidades.map(cidade => <option key={cidade.id} value={cidade.nome}>{cidade.nome}</option>)}
                        </select>
                    </div>
                    <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                        {loading ? 'Analisando...' : 'Calcular Economia'}
                    </button>
                </form>
            </div>

            <div className="results-section">
                {loading && <div className="loader"></div>}
                {!loading && !analysis && (
                    <div className="placeholder">
                        <h3>Seus Resultados Aparecerão Aqui</h3>
                        <p>Preencha o formulário ao lado para iniciar a simulação.</p>
                    </div>
                )}
                {analysis && (
                    <div className="results-content">
                        <h3>Análise Completa</h3>
                        <div className="row">
                            <div className="col-md-6">
                                <div className="card result-card">
                                    <h5>Dimensionamento</h5>
                                    <p>{analysis.numModulos} Módulos de 560W</p>
                                    <p>{analysis.potenciaFinal} kWp de Potência</p>
                                    <p>{analysis.areaNecessaria} m² de Área</p>
                                    <p>Geração Mensal Real: {analysis.geracaoMensalReal} kWh</p>
                                    <p>Inversor Sugerido: {analysis.inversorSugerido}</p>
                                </div>
                            </div>
                            <div className="col-md-6">
                                <div className="card result-card">
                                    <h5>Investimento</h5>
                                    <p>Kit Solar: {analysis.precoKit}</p>
                                    <p>Economia Mensal: {analysis.economiaMensal}</p>
                                    <p>Economia Anual: {analysis.economiaAnual}</p>
                                    <p>Payback: {analysis.paybackAnos} anos e {analysis.paybackMesesRestantes} meses</p>
                                </div>
                            </div>
                        </div>
                        <div className="card result-card mt-3">
                            <h5>Projeção Financeira (25 Anos)</h5>
                            <Line data={analysis.chartData} options={{ responsive: true }} />
                        </div>
                        <div className="card result-card mt-3">
                            <h5>Opções de Financiamento (Carência de 90 dias)</h5>
                            <table className="table table-sm text-center">
                                <thead><tr><th>48x</th><th>60x</th><th>72x</th></tr></thead>
                                <tbody>
                                    <tr>
                                        <td>{analysis.financiamento.p48.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        <td>{analysis.financiamento.p60.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                        <td>{analysis.financiamento.p72.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                         <div className="text-center mt-4">
                            <a href="https://wa.me/5567999999999?text=Olá!%20Gostaria%20de%20mais%20informações%20sobre%20o%20sistema%20fotovoltaico%20dimensionado%20no%20simulador." className="btn btn-success btn-lg" target="_blank" rel="noopener noreferrer">
                              Fale com um Especialista
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
