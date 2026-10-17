interface ConfigMissingPageProps {
  missingVariables: string[]
}

export function ConfigMissingPage({
  missingVariables,
}: ConfigMissingPageProps) {
  return (
    <main className="standalone-page">
      <section className="state-panel" aria-labelledby="config-missing-title">
        <h1 id="config-missing-title">Conexión pendiente de configuración</h1>
        <p>
          Para usar la aplicación, configura las variables de entorno requeridas
          y vuelve a cargar la página.
        </p>
        <ul>
          {missingVariables.map((variable) => (
            <li key={variable}>
              <code>{variable}</code>
            </li>
          ))}
        </ul>
        <p>No se intentó iniciar sesión ni guardar información.</p>
      </section>
    </main>
  )
}
