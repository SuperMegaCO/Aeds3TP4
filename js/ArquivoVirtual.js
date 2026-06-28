class ArquivoVirtual {
    static TAM_CABECALHO = 12;
    
    constructor() {
        this.onLog = null; 
        this.index = new Map(); 
        
        const dadosSalvos = typeof localStorage !== 'undefined' ? localStorage.getItem("db_produtos") : null;
        if (dadosSalvos) {
            const arr = JSON.parse(dadosSalvos);
            this.memoria = new Int8Array(arr);
            this.offset = this.memoria.length;
            
            this.ultimoId = ByteStream.readInt(this.memoria, 0);
            this.ponteiroLixo = ByteStream.readLong(this.memoria, 4);
            
            this.#log(`Arquivo carregado do LocalStorage. Tamanho: ${this.memoria.length} bytes. Último ID: ${this.ultimoId}, Ponteiro Lixo: ${this.ponteiroLixo}`);
        } else {
            this.memoria = new Int8Array(128); // Tamanho inicial pequeno para facilitar visualização
            this.offset = 0;
            this.ultimoId = 0;
            this.ponteiroLixo = -1n;
            
            this.#gravarCabecalho();
            this.#log(`Novo arquivo criado. Cabeçalho inicial gravado (12 bytes). Último ID: 0, Ponteiro Lixo: -1.`);
            this.salvarNoLocalStorage();
        }
        
        this.reconstruirIndice();
    }
    
    #log(mensagem) {
        console.log(mensagem);
        if (typeof this.onLog === "function") {
            this.onLog(mensagem);
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

    salvarNoLocalStorage() {
        if (typeof localStorage !== 'undefined') {
            const bytesUteis = this.memoria.slice(0, this.offset);
            localStorage.setItem("db_produtos", JSON.stringify(Array.from(bytesUteis)));
        }
    }

    resetarArquivo() {
        this.memoria = new Int8Array(128);
        this.offset = 0;
        this.ultimoId = 0;
        this.ponteiroLixo = -1n;
        this.#gravarCabecalho();
        this.index.clear();
        this.salvarNoLocalStorage();
        this.#log("Arquivo resetado para o estado inicial.");
    }
    
    reconstruirIndice() {
        this.index.clear();
        let pos = ArquivoVirtual.TAM_CABECALHO;
        this.#log("[Índice] Iniciando reconstrução do índice direto escaneando o arquivo...");

        while (pos < this.offset) {
            const lapide = ByteStream.readByte(this.memoria, pos);
            const tamanho = ByteStream.readShort(this.memoria, pos + 1);

            if (lapide === 32) { // 32 = ' ' (Ativo)
                const id = ByteStream.readInt(this.memoria, pos + 3);
                this.index.set(id, pos);
                this.#log(`[Índice] Registro ativo encontrado no endereço ${pos} (ID: ${id}). Adicionado ao índice.`);
            } else if (lapide === 42) { // 42 = '*' (Excluído)
                this.#log(`[Índice] Registro excluído (*) ignorado no endereço ${pos} (Tamanho: ${tamanho} bytes).`);
            } else {
                this.#log(`[Aviso] Lápide inválido (${lapide}) encontrado no endereço ${pos}. Abortando reconstrução.`);
                break;
            }

            pos += 1 + 2 + tamanho;
        }
        this.#log(`[Índice] Reconstrução concluída. Total de chaves no índice: ${this.index.size}`);
    }

    gerarNovoId() {
        this.ultimoId += 1;
        this.#gravarCabecalho();
        this.#log(`[Cabeçalho] Novo ID gerado: ${this.ultimoId}. Cabeçalho atualizado.`);
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

        this.#log(`[Memória] Redimensionando Int8Array: de ${this.memoria.length} para ${novaCapacidade} bytes.`);

        const novaMemoria = new Int8Array(novaCapacidade);
        novaMemoria.set(this.memoria);
        this.memoria = novaMemoria;
    }

    // --- CRUD ---

    inserirProduto(produto) {
        const id = this.gerarNovoId();
        produto.id = id;
        
        const payloadBytes = produto.toByteArray();
        const tamanhoRegistro = payloadBytes.length;
        
        this.#log(`[CREATE] Iniciando inserção do Produto ID ${id} ("${produto.nome}", R$ ${produto.preco}). Payload: ${tamanhoRegistro} bytes.`);
        
        let endereco = this.getDeleted(tamanhoRegistro);
        
        if (endereco === -1) {
            this.#garantirEspaco(1 + 2 + tamanhoRegistro);
            endereco = this.offset;
            this.#log(`[CREATE] Gravando novo registro no fim do arquivo, no endereço ${endereco}.`);
            
            this.memoria.set(ByteStream.writeByte(32), endereco);
            this.memoria.set(ByteStream.writeShort(tamanhoRegistro), endereco + 1);
            this.memoria.set(payloadBytes, endereco + 3);
            
            this.offset += 1 + 2 + tamanhoRegistro;
        } else {
            this.#log(`[CREATE] Reaproveitando espaço excluído no endereço ${endereco}.`);
            this.memoria.set(ByteStream.writeByte(32), endereco);
            this.memoria.set(payloadBytes, endereco + 3);
        }
        
        this.index.set(id, endereco);
        this.#log(`[CREATE] Índice atualizado: ID ${id} -> Endereço ${endereco}.`);
        
        this.salvarNoLocalStorage();
        return id;
    }

    buscarProduto(id) {
        this.#log(`[READ] Buscando Produto ID ${id}...`);
        if (!this.index.has(id)) {
            this.#log(`[READ] Produto ID ${id} não encontrado no índice direto.`);
            return null;
        }

        const endereco = this.index.get(id);
        this.#log(`[READ] Endereço do ID ${id} encontrado no índice: ${endereco}. Acessando memória...`);
        
        const lapide = ByteStream.readByte(this.memoria, endereco);
        if (lapide !== 32) {
            this.#log(`[READ] Falha: Registro no endereço ${endereco} possui lápide '${String.fromCharCode(lapide)}' (não ativo).`);
            return null;
        }

        const tamanho = ByteStream.readShort(this.memoria, endereco + 1);
        const payloadBytes = this.memoria.slice(endereco + 3, endereco + 3 + tamanho);
        
        const produto = new Produto();
        produto.fromByteArray(payloadBytes);
        
        this.#log(`[READ] Produto ID ${id} lido com sucesso do endereço ${endereco}.`);
        return { produto, endereco };
    }

    excluirProduto(id) {
        this.#log(`[DELETE] Iniciando exclusão do Produto ID ${id}...`);
        if (!this.index.has(id)) {
            this.#log(`[DELETE] Falha: Produto ID ${id} não encontrado.`);
            return false;
        }

        const endereco = this.index.get(id);
        const tamanho = ByteStream.readShort(this.memoria, endereco + 1);
        
        this.memoria.set(ByteStream.writeByte(42), endereco); // '*' (42)
        this.#log(`[DELETE] Lápide alterado para '*' (excluído) no endereço ${endereco}.`);
        
        this.index.delete(id);
        
        this.addDeleted(tamanho, endereco);
        
        this.salvarNoLocalStorage();
        this.#log(`[DELETE] Produto ID ${id} excluído com sucesso.`);
        return true;
    }

    alterarProduto(novoProduto) {
        const id = novoProduto.id;
        this.#log(`[UPDATE] Iniciando alteração do Produto ID ${id}...`);
        if (!this.index.has(id)) {
            this.#log(`[UPDATE] Falha: Produto ID ${id} não encontrado.`);
            return false;
        }

        const enderecoAntigo = this.index.get(id);
        const tamanhoAntigo = ByteStream.readShort(this.memoria, enderecoAntigo + 1);
        
        const payloadBytes = novoProduto.toByteArray();
        const tamanhoNovo = payloadBytes.length;
        
        this.#log(`[UPDATE] Comparando tamanhos. Antigo: ${tamanhoAntigo} bytes, Novo: ${tamanhoNovo} bytes.`);
        
        if (tamanhoNovo <= tamanhoAntigo) {
            this.#log(`[UPDATE] Novo tamanho (${tamanhoNovo}) <= Antigo (${tamanhoAntigo}). Sobrescrevendo no mesmo endereço (${enderecoAntigo}).`);
            this.memoria.set(payloadBytes, enderecoAntigo + 3);
        } else {
            this.#log(`[UPDATE] Novo tamanho (${tamanhoNovo}) > Antigo (${tamanhoAntigo}). Movendo registro.`);
            
            this.memoria.set(ByteStream.writeByte(42), enderecoAntigo);
            this.#log(`[UPDATE] Antigo registro no endereço ${enderecoAntigo} marcado como excluído '*'.`);
            this.addDeleted(tamanhoAntigo, enderecoAntigo);
            
            let novoEndereco = this.getDeleted(tamanhoNovo);
            if (novoEndereco === -1) {
                this.#garantirEspaco(1 + 2 + tamanhoNovo);
                novoEndereco = this.offset;
                this.#log(`[UPDATE] Gravando registro atualizado no fim do arquivo (endereço ${novoEndereco}).`);
                
                this.memoria.set(ByteStream.writeByte(32), novoEndereco);
                this.memoria.set(ByteStream.writeShort(tamanhoNovo), novoEndereco + 1);
                this.memoria.set(payloadBytes, novoEndereco + 3);
                
                this.offset += 1 + 2 + tamanhoNovo;
            } else {
                this.#log(`[UPDATE] Gravando registro atualizado no espaço excluído reaproveitado (endereço ${novoEndereco}).`);
                this.memoria.set(ByteStream.writeByte(32), novoEndereco);
                this.memoria.set(payloadBytes, novoEndereco + 3);
            }
            
            this.index.set(id, novoEndereco);
            this.#log(`[UPDATE] Índice atualizado: ID ${id} -> Endereço ${novoEndereco}.`);
        }
        
        this.salvarNoLocalStorage();
        this.#log(`[UPDATE] Produto ID ${id} alterado com sucesso.`);
        return true;
    }

    // --- Gerenciamento da Lista de Excluídos (Ponteiro de Lixo / Free list) ---

    addDeleted(tamanhoEspaco, enderecoEspaco) {
        this.#log(`[Lista de Lixo] Adicionando espaço no endereço ${enderecoEspaco} (tamanho: ${tamanhoEspaco} bytes) na lista de excluídos.`);
        let anterior = 4; 
        let endereco = Number(ByteStream.readLong(this.memoria, anterior));
        let proximo = -1n;
        let tamanho = 0;

        if (endereco === -1) {
            this.#log(`[Lista de Lixo] Lista estava vazia. Atualizando ponteiroLixo no cabeçalho -> ${enderecoEspaco}.`);
            this.memoria.set(ByteStream.writeLong(enderecoEspaco), 4);
            this.memoria.set(ByteStream.writeLong(-1n), enderecoEspaco + 3);
        } else {
            do {
                tamanho = ByteStream.readShort(this.memoria, endereco + 1);
                proximo = ByteStream.readLong(this.memoria, endereco + 3);
                const proximoNum = Number(proximo);

                if (tamanho > tamanhoEspaco) {
                    this.#log(`[Lista de Lixo] Inserindo antes do endereço ${endereco} (pois tamanho do atual ${tamanho} > ${tamanhoEspaco}).`);
                    if (anterior === 4) {
                        this.memoria.set(ByteStream.writeLong(enderecoEspaco), 4);
                    } else {
                        this.memoria.set(ByteStream.writeLong(enderecoEspaco), anterior + 3);
                    }
                    this.memoria.set(ByteStream.writeLong(endereco), enderecoEspaco + 3);
                    break;
                }

                if (proximoNum === -1) {
                    this.#log(`[Lista de Lixo] Fim da lista alcançado. Inserindo após o endereço ${endereco}.`);
                    this.memoria.set(ByteStream.writeLong(enderecoEspaco), endereco + 3);
                    this.memoria.set(ByteStream.writeLong(-1n), enderecoEspaco + 3);
                    break;
                }

                anterior = endereco;
                endereco = proximoNum;
            } while (endereco !== -1);
        }
        
        this.ponteiroLixo = ByteStream.readLong(this.memoria, 4);
    }
    
    getDeleted(tamanhoNecessario) {
        this.#log(`[Lista de Lixo] Buscando espaço de tamanho >= ${tamanhoNecessario} bytes na lista de lixo...`);
        let anterior = 4;
        let endereco = Number(ByteStream.readLong(this.memoria, anterior));
        let proximo = -1n;
        let tamanho = 0;

        while (endereco !== -1) {
            tamanho = ByteStream.readShort(this.memoria, endereco + 1);
            proximo = ByteStream.readLong(this.memoria, endereco + 3);
            const proximoNum = Number(proximo);

            if (tamanho >= tamanhoNecessario) {
                this.#log(`[Lista de Lixo] Espaço adequado encontrado no endereço ${endereco} (tamanho disponível: ${tamanho} bytes). Removendo da lista.`);
                
                if (anterior === 4) {
                    this.memoria.set(ByteStream.writeLong(proximo), 4);
                } else {
                    this.memoria.set(ByteStream.writeLong(proximo), anterior + 3);
                }
                
                this.ponteiroLixo = ByteStream.readLong(this.memoria, 4);
                return endereco;
            }

            anterior = endereco;
            endereco = proximoNum;
        }

        this.#log(`[Lista de Lixo] Nenhum espaço adequado encontrado na lista.`);
        return -1;
    }

    obterBytesUteis() {
        return this.memoria.slice(0, this.offset);
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = ArquivoVirtual;
}