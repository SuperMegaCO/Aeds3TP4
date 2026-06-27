class ArquivoVirtual {
    static TAM_CABECALHO = 12;
    
    constructor(bytesDoLocalStorage = null) {
        if (bytesDoLocalStorage && bytesDoLocalStorage.length >= ArquivoVirtual.TAM_CABECALHO) {
            this.memoria = bytesDoLocalStorage;
            

            this.ultimoId = ByteStream.readInt(this.memoria, 0); 
            this.ponteiroLixo = ByteStream.readLong(this.memoria, 4); 
            
            this.offset = this.memoria.length; 
            
            console.log(`Arquivo carregado. Último ID: ${this.ultimoId}, Ponteiro Lixo: ${this.ponteiroLixo}`);
        } else {
            this.memoria = new Int8Array(1024); // Tamanho inicial
            this.offset = 0;
            
            this.ultimoId = 0;
            this.ponteiroLixo = -1n; 
            
            this.#gravarCabecalho();
        }
    }
    
    #gravarCabecalho() {
        const idBytes = ByteStream.writeInt(this.ultimoId);
        const lixoBytes = ByteStream.writeLong(this.ponteiroLixo);

        const posicaoAntiga = this.offset;

        this.memoria.set(idBytes, 0);
        this.memoria.set(lixoBytes, 4);


        this.offset = posicaoAntiga === 0 ? ArquivoVirtual.TAM_CABECALHO : posicaoAntiga;
    }

 
    gerarNovoId() {
        this.ultimoId += 1;
        this.#gravarCabecalho();
        return this.ultimoId;
    }

    #garantirEspaco(bytesAdicionais) {
        const espacoNecessario = this.offset + bytesAdicionais;
        
        if (espacoNecessario <= this.memoria.length) {
            return;
        }

        let novaCapacidade = this.memoria.length * 2;
        while (novaCapacidade < espacoNecessario) {
            novaCapacidade *= 2;
        }

        console.log(`Redimensionando memória: de ${this.memoria.length} para ${novaCapacidade} bytes.`);

        const novaMemoria = new Int8Array(novaCapacidade);
        
        novaMemoria.set(this.memoria);
        
        this.memoria = novaMemoria;
    }


    seek(posicao) {
        this.offset = posicao;
    }

    inserirProdutoNoFim(produto) {
        const payloadBytes = produto.toByteArray(); // Assumindo o método que criamos antes
        const tamanhoRegistro = payloadBytes.length;
        
        const bytesAdicionais = 1 + 2 + tamanhoRegistro;

        this.#garantirEspaco(bytesAdicionais);

        const lapide = ByteStream.writeByte(32);
        this.memoria.set(lapide, this.offset);
        this.offset += 1;

        const tamanhoBytes = ByteStream.writeShort(tamanhoRegistro);
        this.memoria.set(tamanhoBytes, this.offset);
        this.offset += 2;

        this.memoria.set(payloadBytes, this.offset);
        this.offset += tamanhoRegistro;

        return this.offset; 
    }


    obterBytesUteis() {
        return this.memoria.slice(0, this.offset);
    }
}