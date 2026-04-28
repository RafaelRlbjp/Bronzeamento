const mongoose = require("mongoose")

const AgendamentoSchema = new mongoose.Schema({

nome:String,
servico:String,
data:String,
hora:String,
pagamento:String,
statusPagamento:String

})

module.exports = mongoose.model("Agendamento",AgendamentoSchema)
