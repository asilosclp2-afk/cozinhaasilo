import React, { useState } from 'react';
import { Lock, LogIn, User, Key, AlertCircle } from 'lucide-react';
import { firebaseService } from '../services/firebaseService';

export default function Login({ onLogin }: { onLogin: (user: any) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const user = await firebaseService.login(username, password);
      if (user) {
        localStorage.setItem('kitchen_user', JSON.stringify(user));
        onLogin(user);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.message?.includes('AUTENTICAÇÃO ANÔNIMA')) {
        setError(err.message);
      } else {
        setError(err.message || 'Erro ao fazer login. Verifique sua conexão.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F0F0EE] p-4">
      <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-gray-100 relative overflow-hidden">
        {/* Decorative accent */}
        <div className="absolute top-0 left-0 w-full h-2 bg-[#5A5A40]"></div>
        
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-[#5A5A40] rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-xl shadow-[#5A5A40]/30 transform -rotate-6 hover:rotate-0 transition-transform duration-500">
            <Lock className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">Cozinha</h1>
          <p className="text-gray-500 font-medium uppercase tracking-[0.2em] text-[10px] mt-2">Sistema de Gestão 2026</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className={`p-5 rounded-2xl text-[11px] font-medium border flex flex-col gap-3 ${
              error.includes('AUTENTICAÇÃO ANÔNIMA') 
                ? 'bg-amber-50 text-amber-800 border-amber-200' 
                : 'bg-red-50 text-red-600 border-red-100'
            }`}>
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span className="leading-relaxed">{error}</span>
              </div>
              
              {error.includes('AUTENTICAÇÃO ANÔNIMA') && (
                <div className="flex flex-col gap-3 pt-3 border-t border-amber-200/50 mt-1">
                  <p className="font-bold uppercase tracking-wider text-[9px] text-amber-900">Como corrigir agora:</p>
                  <ol className="list-decimal list-inside space-y-1.5 opacity-90 text-[10px]">
                    <li>Abra o <b>Console do Firebase</b></li>
                    <li>Vá em <b>Authentication</b> {'>'} <b>Provedores</b></li>
                    <li>Clique em <b>Adicionar Provedor</b></li>
                    <li>Escolha <b>Anônimo</b> e clique em <b>Ativar</b></li>
                  </ol>
                  <a 
                    href="https://console.firebase.google.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="mt-2 bg-[#5A5A40] text-white py-3 rounded-xl font-bold text-center shadow-lg hover:bg-[#4A4A30] transition-colors"
                  >
                    Abrir Console do Firebase
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#5A5A40] ml-1">Usuário</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-[#5A5A40]/30 focus:bg-white rounded-xl outline-none transition-all font-medium text-gray-800"
                placeholder="Nome de usuário"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#5A5A40] ml-1">Senha</label>
            <div className="relative">
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent focus:border-[#5A5A40]/30 focus:bg-white rounded-xl outline-none transition-all font-medium text-gray-800"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-[#5A5A40] text-white rounded-xl font-bold text-lg hover:bg-[#4A4A30] transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <>
                <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                Entrar no Sistema
              </>
            )}
          </button>
          
          <div className="mt-8 pt-6 border-t border-gray-100 flex flex-col items-center gap-2">
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest text-center">
              Sistema de Cozinha e Gestão
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
