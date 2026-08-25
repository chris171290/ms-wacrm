export function validarIdentificacionEcuador(identificacion: string): boolean {
  // 1. Validar formato básico (solo números de 10 o 13 dígitos)
  if (!/^[0-9]{10}$|^[0-9]{13}$/.test(identificacion)) {
    return false;
  }
  // 2. Validar código de provincia (primeros dos dígitos entre 01 y 24, o 30 para extranjeros)
  const provincia = parseInt(identificacion.substring(0, 2), 10);
  if ((provincia < 1 || provincia > 24) && provincia !== 30) {
    return false;
  }
  const tercerDigito = parseInt(identificacion.charAt(2), 10);
  // 3. Si es RUC (13 dígitos), validar que termine en los códigos de establecimiento correctos
  if (identificacion.length === 13) {
    const establecimiento = identificacion.substring(10, 13);
    if (establecimiento === '000') {
      return false; // Debe terminar en 001, 002, etc.
    }
  }
  // 4. Aplicar el algoritmo matemático correspondiente según el tercer dígito
  if (tercerDigito < 6) {
    // Persona Natural / Cédula (Módulo 10)
    return validarModulo10(identificacion.substring(0, 10));
  } else if (tercerDigito === 6) {
    // Institución Pública (Módulo 11)
    return validarPublicaModulo11(identificacion.substring(0, 13));
  } else if (tercerDigito === 9) {
    // Sociedad Privada / Jurídica (Módulo 11)
    return validarPrivadaModulo11(identificacion.substring(0, 13));
  }
  return false;
}

function validarModulo10(digitos10: string): boolean {
  const coeficientes = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const digitoVerificador = parseInt(digitos10.charAt(9), 10);
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    let valor = parseInt(digitos10.charAt(i), 10) * coeficientes[i];
    if (valor > 9) {
      valor -= 9;
    }
    suma += valor;
  }
  const residuo = suma % 10;
  const resultado = residuo === 0 ? 0 : 10 - residuo;
  return resultado === digitoVerificador;
}

function validarPublicaModulo11(digitos13: string): boolean {
  const coeficientes = [3, 2, 7, 6, 5, 4, 3, 2];
  const digitoVerificador = parseInt(digitos13.charAt(8), 10);
  let suma = 0;
  for (let i = 0; i < 8; i++) {
    suma += parseInt(digitos13.charAt(i), 10) * coeficientes[i];
  }
  const residuo = suma % 11;
  const resultado = residuo === 0 ? 0 : 11 - residuo;
  return resultado === digitoVerificador;
}

function validarPrivadaModulo11(digitos13: string): boolean {
  const coeficientes = [4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digitoVerificador = parseInt(digitos13.charAt(9), 10);
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    suma += parseInt(digitos13.charAt(i), 10) * coeficientes[i];
  }
  const residuo = suma % 11;
  const resultado = residuo === 0 ? 0 : 11 - residuo;
  return resultado === digitoVerificador;
}