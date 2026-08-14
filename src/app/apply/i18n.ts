// =============================================================================
// By the C — /apply · dicionário bilíngue (EN-US / PT-BR)
// =============================================================================
// Texto extraído do formulário oficial (wiki/raw/docs/2026-08-10-rental-
// application-EN-PT.pdf). Acentuação PT-BR completa. Um único objeto por idioma
// pra o formulário trocar tudo com um toggle sem re-render de servidor.
// =============================================================================

export type Lang = "en" | "pt";

export interface Dict {
  // Cabeçalho
  brand: string;
  addressLine: string;
  title: string;
  intro: string;
  langLabel: string;
  langEN: string;
  langPT: string;

  // Seções
  propertySection: string;
  propertyLabel: string;
  propertyPlaceholder: string;
  propertyOther: string;
  propertyOtherLabel: string;

  applicantSection: string;
  fullName: string;
  dob: string;
  ssnQuestion: string;
  ssn: string;
  ssnHint: string;
  ssnNoneExplain: string;
  phone: string;
  licenseQuestion: string;
  license: string;
  govIdType: string;
  govIdStateId: string;
  govIdPassport: string;
  govIdNumber: string;
  email: string;

  idUploadApplicant: string;
  idUploadOccupant: string;
  idUploadHint: string;
  uploadCta: string;
  uploading: string;
  uploaded: string;
  uploadFailed: string;

  occupantsSection: string;
  occupantsNote: string;
  occupantsSolo: string;
  occupantsCount: string;
  occName: string;
  occDob: string;
  occAdult: string;
  occPhone: string;
  addOccupant: string;
  remove: string;

  historySection: string;
  historyHint: string;
  current: string;
  previous: string;
  street: string;
  city: string;
  stateLabel: string;
  zip: string;
  howLong: string;
  landlordName: string;
  landlordPhone: string;

  vehiclesSection: string;
  makeModel: string;
  year: string;
  color: string;
  plate: string;
  plateState: string;
  addVehicle: string;

  employmentSection: string;
  employer: string;
  employerAddress: string;
  managerName: string;
  managerPhone: string;
  jobTitle: string;
  monthlyIncome: string;
  lengthEmployment: string;

  referencesSection: string;
  ref1: string;
  ref2: string;
  refName: string;
  refPhone: string;

  additionalSection: string;
  evicted: string;
  felony: string;
  bankruptcy: string;
  ifYesWhen: string;
  smoke: string;
  pets: string;
  petsList: string;
  reasonMoving: string;
  yes: string;
  no: string;

  consentSection: string;
  consentText: string;
  consentCheckbox: string;
  signature: string;
  signature2: string;
  date: string;

  feeSection: string;
  feeText: string;
  cardLabel: string;

  submit: string;
  submitting: string;
  required: string;
  fixErrors: string;
  yesShort: string;
  noShort: string;
  errorGeneric: string;
  payFirst: string;
}

const en: Dict = {
  brand: "By the C Realty & Property Management",
  addressLine: "724 Main St Unit E, Hyannis MA 02601 · (508) 364-8556 · info@bythecrealty.com",
  title: "Rental Application",
  intro: "Apply for a year-round or off-season rental. All information is kept confidential and used only to process your application.",
  langLabel: "Language",
  langEN: "English",
  langPT: "Português",

  propertySection: "Property Applying For",
  propertyLabel: "Property",
  propertyPlaceholder: "Select a property…",
  propertyOther: "Not listed / other",
  propertyOtherLabel: "Which property? (address or description)",

  applicantSection: "Applicant Information",
  fullName: "Full Name",
  dob: "Date of Birth (MM/DD/YY)",
  ssnQuestion: "Do you have a Social Security # or ITIN?",
  ssn: "Social Security # / ITIN #",
  ssnHint: "Encrypted and visible only to By the C staff.",
  ssnNoneExplain: "Please explain why you don't have an SSN or ITIN",
  phone: "Phone Number",
  licenseQuestion: "Do you have a driver's license?",
  license: "Driver's License # / State",
  govIdType: "Government ID type",
  govIdStateId: "State ID card",
  govIdPassport: "Passport",
  govIdNumber: "Government ID number",
  email: "Email Address",

  idUploadApplicant: "Upload your government ID",
  idUploadOccupant: "Upload this occupant's government ID",
  idUploadHint: "Photo or file (driver's license, State ID, or passport). Take a picture on your phone or choose a file.",
  uploadCta: "Upload / take photo",
  uploading: "Uploading…",
  uploaded: "Uploaded",
  uploadFailed: "Upload failed — please try again.",

  occupantsSection: "Other Occupant Information",
  occupantsNote: "All occupants must be listed.",
  occupantsSolo: "Just you — no other occupants to list.",
  occupantsCount: "Number of Occupants",
  occName: "Full Name",
  occDob: "Date of Birth (MM/DD/YY)",
  occAdult: "18 or older?",
  occPhone: "Phone Number (must differ from applicant's)",
  addOccupant: "+ Add occupant",
  remove: "Remove",

  historySection: "Rental History",
  historyHint: "Please list your current address and your most recent previous address.",
  current: "Current Address",
  previous: "Previous Address",
  street: "Street Address / Unit #",
  city: "City",
  stateLabel: "State",
  zip: "Zip",
  howLong: "How long at this address",
  landlordName: "Landlord Name",
  landlordPhone: "Landlord Phone Number",

  vehiclesSection: "Vehicle Information",
  makeModel: "Make & Model",
  year: "Year",
  color: "Color",
  plate: "Plate #",
  plateState: "Plate State",
  addVehicle: "+ Add vehicle",

  employmentSection: "Employment Information",
  employer: "Current Employer",
  employerAddress: "Employer Address",
  managerName: "Manager Name",
  managerPhone: "Manager Phone Number",
  jobTitle: "Job Title",
  monthlyIncome: "Monthly Income",
  lengthEmployment: "Length of Employment",

  referencesSection: "References",
  ref1: "Personal Reference 1",
  ref2: "Personal Reference 2",
  refName: "Name",
  refPhone: "Phone",

  additionalSection: "Additional Information",
  evicted: "Have you ever been evicted?",
  felony: "Have you ever been convicted of a felony?",
  bankruptcy: "Have you ever filed for bankruptcy?",
  ifYesWhen: "If yes, when & why",
  smoke: "Do you currently smoke?",
  pets: "Do you have any pets?",
  petsList: "If yes, please list each type, breed & approx. weight",
  reasonMoving: "Reason for moving",
  yes: "Yes",
  no: "No",

  consentSection: "Signature and Consent",
  consentText:
    "I believe that the statements I have made are true and correct. I hereby authorize the verification of information I provided, communication with any and all names listed on this application and for the issuer of this form to conduct a background check to obtain additional information on credit history, criminal history and all Unlawful Detainers. I understand that any discrepancy or lack of information may result in the rejection of this application. I understand that this is an application for a home or apartment and does not constitute a rental or lease agreement in whole or in part. I further understand that there is a non-refundable fee of $100.00 to cover the cost of processing my application and I am not entitled to a refund.",
  consentCheckbox: "I have read and agree to the statement above, and authorize the background and credit check.",
  signature: "Signature (type your full name)",
  signature2: "Second applicant signature (optional)",
  date: "Date",

  feeSection: "Application Fee",
  feeText: "A non-refundable $100.00 application fee is required. A $3.30 card processing fee is added so we receive the full amount — your card is charged $103.30 total when you submit.",
  cardLabel: "Card details",

  submit: "Pay $103.30 & Submit Application",
  submitting: "Submitting…",
  required: "This field is required.",
  fixErrors: "Please complete all required fields highlighted below before submitting.",
  yesShort: "Yes",
  noShort: "No",
  errorGeneric: "Something went wrong. Please review the form and try again.",
  payFirst: "Please complete the card payment fields above.",
};

const pt: Dict = {
  brand: "By the C Realty & Property Management",
  addressLine: "724 Main St Unit E, Hyannis MA 02601 · (508) 364-8556 · info@bythecrealty.com",
  title: "Aplicação Para Aluguel",
  intro: "Candidate-se a um aluguel anual ou de temporada. Todas as informações são mantidas em sigilo e usadas apenas para processar a sua aplicação.",
  langLabel: "Idioma",
  langEN: "English",
  langPT: "Português",

  propertySection: "Propriedade Solicitada",
  propertyLabel: "Propriedade",
  propertyPlaceholder: "Selecione uma propriedade…",
  propertyOther: "Não listada / outra",
  propertyOtherLabel: "Qual propriedade? (endereço ou descrição)",

  applicantSection: "Informações do Candidato",
  fullName: "Nome Completo",
  dob: "Data de Nascimento (MM/DD/AA)",
  ssnQuestion: "Você tem Social Security nº ou ITIN?",
  ssn: "Número Social Security ou ITIN nº",
  ssnHint: "Criptografado e visível apenas para a equipe da By the C.",
  ssnNoneExplain: "Explique por que você não tem SSN ou ITIN",
  phone: "Número de Telefone",
  licenseQuestion: "Você tem carteira de motorista?",
  license: "Carteira de Motorista nº / Estado",
  govIdType: "Tipo de documento oficial",
  govIdStateId: "State ID (carteira de identidade)",
  govIdPassport: "Passaporte",
  govIdNumber: "Número do documento oficial",
  email: "Endereço de E-mail",

  idUploadApplicant: "Envie seu documento oficial com foto",
  idUploadOccupant: "Envie o documento oficial deste ocupante",
  idUploadHint: "Foto ou arquivo (carteira de motorista, State ID ou passaporte). Tire uma foto no celular ou escolha um arquivo.",
  uploadCta: "Enviar / tirar foto",
  uploading: "Enviando…",
  uploaded: "Enviado",
  uploadFailed: "Falha no envio — tente novamente.",

  occupantsSection: "Informações do Ocupante",
  occupantsNote: "Todos os ocupantes devem ser listados.",
  occupantsSolo: "Apenas você — nenhum outro ocupante a listar.",
  occupantsCount: "Número de ocupantes",
  occName: "Nome Completo",
  occDob: "Data de Nascimento (MM/DD/AA)",
  occAdult: "18 anos ou mais?",
  occPhone: "Número de Telefone (diferente do candidato)",
  addOccupant: "+ Adicionar ocupante",
  remove: "Remover",

  historySection: "Histórico de Aluguel",
  historyHint: "Liste seu endereço atual e o endereço anterior mais recente.",
  current: "Endereço Atual",
  previous: "Endereço Anterior",
  street: "Endereço / Unidade nº",
  city: "Cidade",
  stateLabel: "Estado",
  zip: "CEP",
  howLong: "Quanto tempo neste endereço",
  landlordName: "Nome do Proprietário",
  landlordPhone: "Contato do Proprietário",

  vehiclesSection: "Informações do Veículo",
  makeModel: "Marca e Modelo",
  year: "Ano",
  color: "Cor",
  plate: "Placa nº",
  plateState: "Estado da Placa",
  addVehicle: "+ Adicionar veículo",

  employmentSection: "Informações de Emprego",
  employer: "Empregador Atual",
  employerAddress: "Endereço do Empregador",
  managerName: "Nome do Gerente",
  managerPhone: "Contato do Gerente",
  jobTitle: "Cargo",
  monthlyIncome: "Renda Mensal",
  lengthEmployment: "Tempo de Emprego",

  referencesSection: "Referências",
  ref1: "Referência Pessoal 1",
  ref2: "Referência Pessoal 2",
  refName: "Nome",
  refPhone: "Telefone",

  additionalSection: "Informações Adicionais",
  evicted: "Você já foi despejado?",
  felony: "Você já foi condenado por um crime?",
  bankruptcy: "Você já declarou falência?",
  ifYesWhen: "Se sim, quando e porquê",
  smoke: "Você fuma atualmente?",
  pets: "Você tem animais de estimação?",
  petsList: "Se sim, liste cada tipo, raça e peso aprox.",
  reasonMoving: "Motivo da mudança",
  yes: "Sim",
  no: "Não",

  consentSection: "Assinatura e Consentimento",
  consentText:
    "Acredito que as declarações que fiz são verdadeiras e corretas. Por meio deste, autorizo a verificação das informações que forneci, a comunicação com todo e qualquer nome listado nesta aplicação e para que o emissor desta aplicação conduza uma verificação de antecedentes para obter informações adicionais sobre histórico de crédito, antecedentes criminais e todos os Detentores Ilegais. Compreendo que qualquer discrepância ou falta de informação poderá resultar na rejeição desta aplicação. Entendo que este é um pedido de locação e não constitui um contrato de locação. Compreendo ainda que existe uma taxa de $100.00 não reembolsável para cobrir os custos de processamento da minha aplicação e não tenho direito a reembolso.",
  consentCheckbox: "Li e concordo com a declaração acima, e autorizo a verificação de antecedentes e crédito.",
  signature: "Assinatura (digite seu nome completo)",
  signature2: "Assinatura do segundo candidato (opcional)",
  date: "Data",

  feeSection: "Taxa de Aplicação",
  feeText: "É necessária uma taxa de aplicação não reembolsável de $100.00. Uma taxa de processamento de cartão de $3.30 é adicionada para recebermos o valor integral — seu cartão é cobrado no total de $103.30 ao enviar.",
  cardLabel: "Dados do cartão",

  submit: "Pagar $103.30 e Enviar Aplicação",
  submitting: "Enviando…",
  required: "Este campo é obrigatório.",
  fixErrors: "Preencha todos os campos obrigatórios destacados abaixo antes de enviar.",
  yesShort: "Sim",
  noShort: "Não",
  errorGeneric: "Algo deu errado. Revise o formulário e tente novamente.",
  payFirst: "Complete os campos de pagamento do cartão acima.",
};

export const DICT: Record<Lang, Dict> = { en, pt };
