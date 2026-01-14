import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ResourceType = 'usuarios' | 'agentes' | 'funis' | 'conexoes' | 'conexoes_evolution' | 'conexoes_meta' | 'instagram' | 'mensagens';

interface ValidationResult {
  allowed: boolean;
  message: string;
  current?: number;
  limit?: number;
  plan_name?: string;
}

export async function validarLimitePlano(
  contaId: string,
  resourceType: ResourceType
): Promise<ValidationResult> {
  try {
    const { data, error } = await supabase.functions.invoke('validar-limite-plano', {
      body: {
        conta_id: contaId,
        resource_type: resourceType
      }
    });

    if (error) {
      console.error('Error validating plan limit:', error);
      // On error, allow creation (fail open) but log the issue
      return { allowed: true, message: 'Erro ao validar limite, permitindo criação' };
    }

    return data as ValidationResult;
  } catch (err) {
    console.error('Exception validating plan limit:', err);
    return { allowed: true, message: 'Erro ao validar limite, permitindo criação' };
  }
}

export async function validarEExibirErro(
  contaId: string,
  resourceType: ResourceType,
  showUpgradeAction: boolean = false
): Promise<boolean> {
  const result = await validarLimitePlano(contaId, resourceType);
  
  if (!result.allowed) {
    if (showUpgradeAction && resourceType === 'mensagens') {
      toast.error(result.message, {
        duration: 6000,
        action: {
          label: 'Ver Planos',
          onClick: () => window.location.href = '/configuracoes'
        }
      });
    } else {
      toast.error(result.message);
    }
    return false;
  }
  
  return true;
}
