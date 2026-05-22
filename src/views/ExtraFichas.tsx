import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { QrCode, Trash2, Search, Plus, Save, Camera, CheckCircle2, AlertCircle } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { firebaseService } from '../services/firebaseService';
import { ExtraFicha } from '../types';

export default function ExtraFichas() {
  const [fichas, setFichas] = useState<ExtraFicha[]>([]);
  const [useCamera, setUseCamera] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualAlias, setManualAlias] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filter, setFilter] = useState('');
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchFichas();
  }, []);

  const fetchFichas = async () => {
    const data = await firebaseService.getExtraFichas();
    if (data) setFichas(data);
  };

  const handleRegister = async (code: string, alias?: string) => {
    if (!code) return;
    setIsSubmitting(true);
    try {
      const result = await firebaseService.registerExtraFicha(code, alias);
      if (result.already_existed) {
        setMessage({ text: `Código ${code} já cadastrado como "${result.alias}"`, type: 'error' });
      } else {
        setMessage({ text: `Ficha ${alias || code} cadastrada com sucesso!`, type: 'success' });
        fetchFichas();
        setManualCode('');
        setManualAlias('');
      }
    } catch (err: any) {
      setMessage({ text: 'Erro ao cadastrar ficha: ' + (err.message || ''), type: 'error' });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Deseja excluir este cadastro?')) {
      await firebaseService.deleteExtraFicha(id);
      fetchFichas();
    }
  };

  const filteredFichas = fichas.filter(f => 
    f.code.toLowerCase().includes(filter.toLowerCase()) || 
    f.alias.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-serif italic text-[#1A1A1A]">Cadastro de Fichas Extras</h1>
          <p className="text-gray-500 font-medium tracking-wide uppercase text-xs mt-2">
            Registre novos QR Codes no sistema
          </p>
        </div>
        
        <button 
          onClick={() => setUseCamera(!useCamera)}
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shadow-lg ${
            useCamera ? 'bg-red-500 text-white' : 'bg-[#1A1A1A] text-white'
          }`}
        >
          <Camera className="w-5 h-5" />
          {useCamera ? "Fechar Câmera" : "Bipar com Câmera"}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Register */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-white rounded-[32px] p-8 shadow-sm border border-black/5">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#5A5A40]" />
              Nova Ficha
            </h2>

            {useCamera && (
              <div className="mb-6 rounded-2xl overflow-hidden border-4 border-[#1A1A1A] aspect-square relative">
                <Scanner
                  onScan={(result) => result?.[0]?.rawValue && handleRegister(result[0].rawValue)}
                  onError={(error: any) => console.log(error?.message)}
                  constraints={{
                    aspectRatio: 1,
                    facingMode: 'environment'
                  }}
                  scanDelay={500}
                />
                <div className="absolute inset-0 border-[40px] border-black/30 pointer-events-none" />
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Código (Scaneado ou Manual)</label>
                <div className="relative">
                  <QrCode className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Bipe aqui ou digite..."
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] text-lg font-bold"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Apelido / Nome (Opcional)</label>
                <input
                  type="text"
                  value={manualAlias}
                  onChange={(e) => setManualAlias(e.target.value)}
                  placeholder="Ex: Ficha 51 VIP"
                  className="w-full px-4 py-4 bg-gray-50 rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40]"
                />
              </div>

              <button
                onClick={() => handleRegister(manualCode, manualAlias)}
                disabled={!manualCode || isSubmitting}
                className="w-full py-4 bg-[#5A5A40] text-white rounded-2xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Save className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Salvar Cadastro
              </button>
            </div>

            {message && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-6 p-4 rounded-2xl flex items-center gap-3 font-medium ${
                  message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                {message.text}
              </motion.div>
            )}
          </section>
        </div>

        {/* Right Column: List */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white rounded-[32px] p-8 shadow-sm border border-black/5 min-h-[500px]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <h2 className="text-xl font-bold">Fichas Cadastradas ({fichas.length})</h2>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar código ou apelido..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-gray-50 rounded-xl border-none focus:ring-2 focus:ring-[#5A5A40] text-sm w-full md:w-64"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-4 text-xs font-bold uppercase tracking-widest text-gray-400">Código</th>
                    <th className="pb-4 text-xs font-bold uppercase tracking-widest text-gray-400">Apelido</th>
                    <th className="pb-4 text-xs font-bold uppercase tracking-widest text-gray-400">Data</th>
                    <th className="pb-4 text-xs font-bold uppercase tracking-widest text-gray-400 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredFichas.map((ficha) => (
                    <tr key={ficha.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="py-4 font-mono text-sm font-bold">{ficha.code}</td>
                      <td className="py-4 text-sm font-medium">{ficha.alias}</td>
                      <td className="py-4 text-xs text-gray-400">
                        {new Date(ficha.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-4 text-right">
                        <button
                          onClick={() => handleDelete(ficha.id)}
                          className="p-2 text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredFichas.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-20 text-center">
                        <QrCode className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                        <p className="text-gray-400 font-medium">Nenhuma ficha extra encontrada.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
