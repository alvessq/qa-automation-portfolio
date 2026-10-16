// O que cada conferência do health olha, em português simples. Usado pelo
// catálogo de automações e pelo "O que testa" do painel.
export const HEALTH_LABELS = {
  mobile: {
    device: ['Celular online', 'o adb enxerga um celular ou emulador pronto'],
    apk: ['APK do app', 'o arquivo do My Demo App está baixado'],
    driver: ['Driver do Appium', 'o UiAutomator2 está instalado'],
  },
  web: {
    pagina: ['Página inicial', 'o site responde HTTP 200'],
    app: ['Aplicativo', 'o JavaScript traz o formulário de login'],
    estilos: ['Folha de estilo', 'o CSS da página carrega'],
    catalogo: ['Catálogo de produtos', 'o catálogo tem produtos'],
    imagens: ['Imagens dos produtos', 'a imagem de um produto carrega'],
  },
};
