const mongoose = require("mongoose")

const AvaliacaoSchema = new mongoose.Schema({

nome:String,
comentario:String,
nota:String

})

module.exports = mongoose.model("Avaliacao",AvaliacaoSchema)