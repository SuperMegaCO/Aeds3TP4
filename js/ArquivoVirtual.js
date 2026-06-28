class ArquivoVirtual {
    static TAM_CABECALHO = 12;

    constructor(bytesDoLocalStorage = null) {
        if (bytesDoLocalStorage && bytesDoLocalStorage.length >= ArquivoVirtual.TAM_CABECALHO) {
            this.memoria = bytesDoLocalStorage;


            this.ultimoId = ByteStream.readInt(this.memoria, 0);
            this.ponteiroLixo = ByteStream.readLong(this.memoria, 4);

            this.offset = this.memoria.length;
            this.reconstruirIndice();
            console.log(`Arquivo carregado. Último ID: ${this.ultimoId}, Ponteiro Lixo: ${this.ponteiroLixo}`);
        } else {
            this.memoria = new Int8Array(1024); // Tamanho inicial
            this.offset = 0;

            this.ultimoId = 0;
            this.ponteiroLixo = -1n;
            this.index = new Map();
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
    reconstruirIndice() {
        this.index.clear();
        let currentOffset = ArquivoVirtual.TAM_CABECALHO;
        while (currentOffset < this.offset) {
            const lapide = ByteStream.readByte(this.memoria, currentOffset);
            const tamanhoRegistro = ByteStream.readShort(this.memoria, currentOffset + 1);
            if (lapide === 32) {
                const id = ByteStream.readInt(this.memoria, currentOffset + 3);
                this.index.set(id, currentOffset);
            }
            currentOffset += 1 + 2 + tamanhoRegistro;
        }
        console.log("Index rebuilt successfully:", this.index);
    }

    seek(posicao) {
        this.offset = posicao;
    }
    buscar(id) {
        if (!this.index.has(id)) {
            return null;
        }
        const endereco = this.index.get(id);

        const lapide = ByteStream.readByte(this.memoria, endereco);
        if (lapide !== 32) return null;
        const tamanho = ByteStream.readShort(this.memoria, endereco + 1);
        const payloadBytes = this.memoria.slice(endereco + 3, endereco + 3 + tamanho);
        const produto = new Produto();
        produto.fromByteArray(payloadBytes);
        return { produto, endereco };
    }
    inserir(produto) {
        const novoId = this.gerarNovoId();
        produto.id = novoId;

        const payloadBytes = produto.toByteArray();
        const tamanhoRegistro = payloadBytes.length;

        let endereco = this.getDeleted(tamanhoRegistro);

        if (endereco === -1) {
            this.#garantirEspaco(1 + 2 + tamanhoRegistro);
            endereco = this.offset;

            this.memoria.set(ByteStream.writeByte(32), endereco);
            this.memoria.set(ByteStream.writeShort(tamanhoRegistro), endereco + 1);
            this.memoria.set(payloadBytes, endereco + 3);

            this.offset += 1 + 2 + tamanhoRegistro;
        } else {
            this.memoria.set(ByteStream.writeByte(32), endereco);
            this.memoria.set(payloadBytes, endereco + 3);
        }

        this.index.set(novoId, endereco);

        this.salvarNoLocalStorage();
        return novoId;
    }
    excluir(id) {
        if (!this.index.has(id)) return false;

        const endereco = this.index.get(id);
        const tamanho = ByteStream.readShort(this.memoria, endereco + 1);

        this.memoria.set(ByteStream.writeByte(42), endereco);

        this.addDeleted(tamanho, endereco);

        this.index.delete(id);

        this.salvarNoLocalStorage();
        return true;
    }
    alterar(novoProduto) {
        if (!this.index.has(novoProduto.id)) return false;

        const enderecoAntigo = this.index.get(novoProduto.id);
        const tamanhoAntigo = ByteStream.readShort(this.memoria, enderecoAntigo + 1);

        const payloadBytes = novoProduto.toByteArray();
        const tamanhoNovo = payloadBytes.length;

        if (tamanhoNovo <= tamanhoAntigo) {
            this.memoria.set(payloadBytes, enderecoAntigo + 3);
        } else {
            this.memoria.set(ByteStream.writeByte(42), enderecoAntigo);
            this.addDeleted(tamanhoAntigo, enderecoAntigo);

            let novoEndereco = this.getDeleted(tamanhoNovo);
            if (novoEndereco === -1) {
                this.#garantirEspaco(1 + 2 + tamanhoNovo);
                novoEndereco = this.offset;

                this.memoria.set(ByteStream.writeByte(32), novoEndereco);
                this.memoria.set(ByteStream.writeShort(tamanhoNovo), novoEndereco + 1);
                this.memoria.set(payloadBytes, novoEndereco + 3);

                this.offset += 1 + 2 + tamanhoNovo;
            } else {
                this.memoria.set(ByteStream.writeByte(32), novoEndereco);
                this.memoria.set(payloadBytes, novoEndereco + 3);
            }

            this.index.set(novoProduto.id, novoEndereco);
        }

        this.salvarNoLocalStorage();
        return true;
    }


    obterBytesUteis() {
        return this.memoria.slice(0, this.offset);
    }
}