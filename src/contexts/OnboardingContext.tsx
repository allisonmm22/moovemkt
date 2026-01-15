import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

type TipoConexao = 'evolution' | 'meta' | null;

type OnboardingStep = 
  | 'escolha_conexao'
  | 'configurar_conexao'
  | 'aguardar_conexao'
  | 'configurar_openai'
  | 'configurar_agente'
  | 'concluido';

interface OnboardingContextType {
  isOnboardingActive: boolean;
  currentStep: OnboardingStep;
  tipoConexaoEscolhido: TipoConexao;
  stepsCompleted: OnboardingStep[];
  startOnboarding: () => void;
  nextStep: () => void;
  completeStep: (step: OnboardingStep) => void;
  skipOnboarding: () => void;
  setTipoConexao: (tipo: TipoConexao) => void;
  goToStep: (step: OnboardingStep) => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

const ONBOARDING_STORAGE_KEY = 'moovecrm_onboarding_state';

const STEP_ORDER: OnboardingStep[] = [
  'escolha_conexao',
  'configurar_conexao',
  'aguardar_conexao',
  'configurar_openai',
  'configurar_agente',
  'concluido'
];

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [isOnboardingActive, setIsOnboardingActive] = useState(false);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('escolha_conexao');
  const [tipoConexaoEscolhido, setTipoConexaoEscolhido] = useState<TipoConexao>(null);
  const [stepsCompleted, setStepsCompleted] = useState<OnboardingStep[]>([]);

  // Carregar estado do localStorage
  useEffect(() => {
    const saved = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        setIsOnboardingActive(state.isOnboardingActive || false);
        setCurrentStep(state.currentStep || 'escolha_conexao');
        setTipoConexaoEscolhido(state.tipoConexaoEscolhido || null);
        setStepsCompleted(state.stepsCompleted || []);
      } catch (e) {
        console.error('Erro ao carregar estado do onboarding:', e);
      }
    }
  }, []);

  // Salvar estado no localStorage
  useEffect(() => {
    if (isOnboardingActive || stepsCompleted.length > 0) {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({
        isOnboardingActive,
        currentStep,
        tipoConexaoEscolhido,
        stepsCompleted
      }));
    }
  }, [isOnboardingActive, currentStep, tipoConexaoEscolhido, stepsCompleted]);

  const startOnboarding = () => {
    setIsOnboardingActive(true);
    setCurrentStep('escolha_conexao');
    setStepsCompleted([]);
  };

  const nextStep = () => {
    const currentIndex = STEP_ORDER.indexOf(currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      const nextStepValue = STEP_ORDER[currentIndex + 1];
      setCurrentStep(nextStepValue);
      
      // Navegar automaticamente para a página do próximo passo
      switch (nextStepValue) {
        case 'configurar_conexao':
        case 'aguardar_conexao':
          navigate('/conexao');
          break;
        case 'configurar_openai':
          navigate('/integracoes');
          break;
        case 'configurar_agente':
          navigate('/agente-ia');
          break;
        case 'concluido':
          navigate('/dashboard');
          break;
      }
    }
  };

  const completeStep = (step: OnboardingStep) => {
    if (!stepsCompleted.includes(step)) {
      setStepsCompleted([...stepsCompleted, step]);
    }
  };

  const skipOnboarding = () => {
    setIsOnboardingActive(false);
    localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  };

  const setTipoConexao = (tipo: TipoConexao) => {
    setTipoConexaoEscolhido(tipo);
  };

  const goToStep = (step: OnboardingStep) => {
    setCurrentStep(step);
  };

  return (
    <OnboardingContext.Provider value={{
      isOnboardingActive,
      currentStep,
      tipoConexaoEscolhido,
      stepsCompleted,
      startOnboarding,
      nextStep,
      completeStep,
      skipOnboarding,
      setTipoConexao,
      goToStep
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}
