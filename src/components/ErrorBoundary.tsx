import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      let errorMessage = "Ocorreu um erro inesperado.";
      let isFirebaseError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            isFirebaseError = true;
            errorMessage = `Erro no banco de dados (${parsed.operationType}): ${parsed.error}`;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-[#144a95] via-[#1a5fb4] to-[#144a95] flex items-center justify-center p-4">
          <div className="liquid-glass p-8 rounded-3xl max-w-md w-full text-center space-y-6">
            <div className="bg-red-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10 text-red-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Ops! Algo deu errado</h2>
              <p className="text-white/70 text-sm">
                {errorMessage}
              </p>
            </div>
            <Button 
              onClick={this.handleReset}
              className="bg-white text-[#144a95] hover:bg-white/90 font-bold w-full py-6 rounded-2xl flex items-center justify-center gap-2"
            >
              <RefreshCcw className="w-5 h-5" />
              Recarregar Aplicativo
            </Button>
            {isFirebaseError && (
              <p className="text-[10px] text-white/30">
                Se o erro persistir, verifique sua conexão ou permissões.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
