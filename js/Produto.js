class Produto {
    constructor(id = -1, nome = "", preco = 0.0) {
        this.id = id;
        this.nome = nome;
        this.preco = preco;
    }


    toByteArray() {
        const bytesId = ByteStream.writeInt(this.id);
        const bytesNome = ByteStream.writeString(this.nome);
        const bytesPreco = ByteStream.writeFloat(this.preco);

        const tamanhoTotal = bytesId.length + bytesNome.length + bytesPreco.length;

        const buffer = new Int8Array(tamanhoTotal);
        let offset = 0;

        buffer.set(bytesId, offset);
        offset += bytesId.length;

        buffer.set(bytesNome, offset);
        offset += bytesNome.length;

        buffer.set(bytesPreco, offset);
        
        return buffer;
    }


    fromByteArray(bytes) {
        let offset = 0;

        this.id = ByteStream.readInt(bytes, offset);
        offset += 4; 

        this.nome = ByteStream.readString(bytes, offset);
    
        const tamanhoBytesString = new TextEncoder().encode(this.nome).length;
        offset += (2 + tamanhoBytesString);

        this.preco = ByteStream.readFloat(bytes, offset);
    }
}

