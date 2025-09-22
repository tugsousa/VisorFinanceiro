// frontend/src/utils/logger.js

/**
 * Um serviço de logging que só imprime mensagens na consola
 * em ambiente de desenvolvimento para evitar expor informação em produção.
 */
const logger = {
  /**
   * Imprime mensagens de log normais. Visível apenas em desenvolvimento.
   * @param {...any} args - Argumentos para passar a console.log.
   */
  log: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(...args);
    }
  },

  /**
   * Imprime mensagens de aviso. Visível apenas em desenvolvimento.
   * @param {...any} args - Argumentos para passar a console.warn.
   */
  warn: (...args) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(...args);
    }
  },

  /**
   * Imprime mensagens de erro.
   * Por defeito, os erros são mantidos em produção porque são úteis para
   * integrar com serviços de monitorização (ex: Sentry, LogRocket) e para
   * depuração essencial.
   * @param {...any} args - Argumentos para passar a console.error.
   */
  error: (...args) => {
    // Se não quiser NENHUM log em produção, pode colocar esta linha dentro da condição:
    // if (process.env.NODE_ENV === 'development') {
       console.error(...args);
    // }
  },
};

export default logger;