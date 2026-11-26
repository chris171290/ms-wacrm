export function validarIdentificacionEcuador(input: string): boolean {
  const id = input.trim();

  if (!/^(\d{10}|\d{13})$/.test(id)) return false;

  const provincia = parseInt(id.substring(0, 2), 10);
  if ((provincia < 1 || provincia > 24) && provincia !== 30) return false;

  const tercer = parseInt(id[2], 10);

  if (id.length === 10) {
    return tercer <= 6 && validarModulo10(id);
  }

  // RUC (13 dígitos)
  const estab3 = id.substring(10, 13); // persona natural y sociedad privada
  const estab4 = id.substring(9, 13);  // institución pública

  if (tercer < 6) {
    return estab3 !== '000' && validarModulo10(id.substring(0, 10));
  }
  if (tercer === 6) {
    const publica = estab4 !== '0000' && validarPublicaModulo11(id);
    const natural = estab3 !== '000' && validarModulo10(id.substring(0, 10));
    return publica || natural;
  }
  if (tercer === 9) {
    return estab3 !== '000' && validarPrivadaModulo11(id);
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