# Tasks - K04

- [x] 1. Migracion client_error_logs, politicas y vista de resumen
  - _Requirements: 1.2, 3.3_
- [x] 2. Utilidades
  - [x] 2.1 sanitize, newCorrelationId, logClientError con limite de frecuencia
    - _Requirements: 1.2, 1.3, 1.4, 2.1_
  - [x] 2.2 Pruebas unitarias de saneado (correo, token, query string)
    - _Requirements: 1.3_
- [x] 3. ErrorBoundary global con mensaje en espanol y correlation_id visible
  - _Requirements: 1.1, 2.2_
- [x] 4. Envoltorio en services para propagar correlation_id a las RPC compatibles
  - _Requirements: 2.1_
- [x] 5. Pantalla /administracion/diagnostico con filtros y restriccion de roles
  - _Requirements: 3.1, 3.2, 3.4_
- [ ] 6. Pruebas: rol no autorizado sin acceso, error provocado queda registrado sin datos sensibles
  - _Requirements: 1.2, 1.3, 3.2, 3.3_
- [x] 7. build, lint y test sin errores
