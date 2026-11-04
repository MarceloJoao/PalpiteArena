// Contrato Protobuf da plataforma PalpiteArena para o servico de notificacoes.

// versions:
// 	protoc-gen-go v1.36.12
// 	protoc        (unknown)
// source: palpitearena/notificacao/v1/notificacao.proto

// Pacote versionado conforme a convencao exigida: <produto>.<servico>.<versao>

package notificacaov1

import (
	protoreflect "google.golang.org/protobuf/reflect/protoreflect"
	protoimpl "google.golang.org/protobuf/runtime/protoimpl"
	reflect "reflect"
	sync "sync"
	unsafe "unsafe"
)

const (
	// Verify that this generated code is sufficiently up-to-date.
	_ = protoimpl.EnforceVersion(20 - protoimpl.MinVersion)
	// Verify that runtime/protoimpl is sufficiently up-to-date.
	_ = protoimpl.EnforceVersion(protoimpl.MaxVersion - 20)
)

// Requisicao enviada pela API principal com os detalhes da apuracao do palpite.
type NotificarResultadoPalpiteRequest struct {
	state protoimpl.MessageState `protogen:"open.v1"`
	// Endereco de e-mail do usuario destinatario.
	Destinatario string `protobuf:"bytes,1,opt,name=destinatario,proto3" json:"destinatario,omitempty"`
	// Pontuacao obtida pelo usuario com base no placar oficial.
	Pontos int32 `protobuf:"varint,2,opt,name=pontos,proto3" json:"pontos,omitempty"`
	// Descricao legivel da partida (exemplo: "Flamengo x Vasco").
	PartidaDescricao string `protobuf:"bytes,3,opt,name=partida_descricao,json=partidaDescricao,proto3" json:"partida_descricao,omitempty"`
	// Placar oficial registrado ao final da partida (exemplo: "2x1").
	Placar        string `protobuf:"bytes,4,opt,name=placar,proto3" json:"placar,omitempty"`
	unknownFields protoimpl.UnknownFields
	sizeCache     protoimpl.SizeCache
}

func (x *NotificarResultadoPalpiteRequest) Reset() {
	*x = NotificarResultadoPalpiteRequest{}
	mi := &file_palpitearena_notificacao_v1_notificacao_proto_msgTypes[0]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *NotificarResultadoPalpiteRequest) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*NotificarResultadoPalpiteRequest) ProtoMessage() {}

func (x *NotificarResultadoPalpiteRequest) ProtoReflect() protoreflect.Message {
	mi := &file_palpitearena_notificacao_v1_notificacao_proto_msgTypes[0]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use NotificarResultadoPalpiteRequest.ProtoReflect.Descriptor instead.
func (*NotificarResultadoPalpiteRequest) Descriptor() ([]byte, []int) {
	return file_palpitearena_notificacao_v1_notificacao_proto_rawDescGZIP(), []int{0}
}

func (x *NotificarResultadoPalpiteRequest) GetDestinatario() string {
	if x != nil {
		return x.Destinatario
	}
	return ""
}

func (x *NotificarResultadoPalpiteRequest) GetPontos() int32 {
	if x != nil {
		return x.Pontos
	}
	return 0
}

func (x *NotificarResultadoPalpiteRequest) GetPartidaDescricao() string {
	if x != nil {
		return x.PartidaDescricao
	}
	return ""
}

func (x *NotificarResultadoPalpiteRequest) GetPlacar() string {
	if x != nil {
		return x.Placar
	}
	return ""
}

// Resposta devolvida pelo servico de notificacoes indicando o recebimento da solicitacao.
type NotificarResultadoPalpiteResponse struct {
	state protoimpl.MessageState `protogen:"open.v1"`
	// Identificador unico gerado para a notificacao processada.
	NotificacaoId string `protobuf:"bytes,1,opt,name=notificacao_id,json=notificacaoId,proto3" json:"notificacao_id,omitempty"`
	// Indicador booleano que sinaliza se a notificacao foi enfileirada/enviada com sucesso.
	Sucesso bool `protobuf:"varint,2,opt,name=sucesso,proto3" json:"sucesso,omitempty"`
	// Mensagem textual com detalhes do status da operacao.
	Mensagem      string `protobuf:"bytes,3,opt,name=mensagem,proto3" json:"mensagem,omitempty"`
	unknownFields protoimpl.UnknownFields
	sizeCache     protoimpl.SizeCache
}

func (x *NotificarResultadoPalpiteResponse) Reset() {
	*x = NotificarResultadoPalpiteResponse{}
	mi := &file_palpitearena_notificacao_v1_notificacao_proto_msgTypes[1]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *NotificarResultadoPalpiteResponse) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*NotificarResultadoPalpiteResponse) ProtoMessage() {}

func (x *NotificarResultadoPalpiteResponse) ProtoReflect() protoreflect.Message {
	mi := &file_palpitearena_notificacao_v1_notificacao_proto_msgTypes[1]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use NotificarResultadoPalpiteResponse.ProtoReflect.Descriptor instead.
func (*NotificarResultadoPalpiteResponse) Descriptor() ([]byte, []int) {
	return file_palpitearena_notificacao_v1_notificacao_proto_rawDescGZIP(), []int{1}
}

func (x *NotificarResultadoPalpiteResponse) GetNotificacaoId() string {
	if x != nil {
		return x.NotificacaoId
	}
	return ""
}

func (x *NotificarResultadoPalpiteResponse) GetSucesso() bool {
	if x != nil {
		return x.Sucesso
	}
	return false
}

func (x *NotificarResultadoPalpiteResponse) GetMensagem() string {
	if x != nil {
		return x.Mensagem
	}
	return ""
}

var File_palpitearena_notificacao_v1_notificacao_proto protoreflect.FileDescriptor

const file_palpitearena_notificacao_v1_notificacao_proto_rawDesc = "" +
	"\n" +
	"-palpitearena/notificacao/v1/notificacao.proto\x12\x1bpalpitearena.notificacao.v1\"\xa3\x01\n" +
	" NotificarResultadoPalpiteRequest\x12\"\n" +
	"\fdestinatario\x18\x01 \x01(\tR\fdestinatario\x12\x16\n" +
	"\x06pontos\x18\x02 \x01(\x05R\x06pontos\x12+\n" +
	"\x11partida_descricao\x18\x03 \x01(\tR\x10partidaDescricao\x12\x16\n" +
	"\x06placar\x18\x04 \x01(\tR\x06placar\"\x80\x01\n" +
	"!NotificarResultadoPalpiteResponse\x12%\n" +
	"\x0enotificacao_id\x18\x01 \x01(\tR\rnotificacaoId\x12\x18\n" +
	"\asucesso\x18\x02 \x01(\bR\asucesso\x12\x1a\n" +
	"\bmensagem\x18\x03 \x01(\tR\bmensagem2\xb1\x01\n" +
	"\x12NotificacaoService\x12\x9a\x01\n" +
	"\x19NotificarResultadoPalpite\x12=.palpitearena.notificacao.v1.NotificarResultadoPalpiteRequest\x1a>.palpitearena.notificacao.v1.NotificarResultadoPalpiteResponseBWZUgithub.com/arenapro/notificacao/internal/pb/palpitearena/notificacao/v1;notificacaov1b\x06proto3"

var (
	file_palpitearena_notificacao_v1_notificacao_proto_rawDescOnce sync.Once
	file_palpitearena_notificacao_v1_notificacao_proto_rawDescData []byte
)

func file_palpitearena_notificacao_v1_notificacao_proto_rawDescGZIP() []byte {
	file_palpitearena_notificacao_v1_notificacao_proto_rawDescOnce.Do(func() {
		file_palpitearena_notificacao_v1_notificacao_proto_rawDescData = protoimpl.X.CompressGZIP(unsafe.Slice(unsafe.StringData(file_palpitearena_notificacao_v1_notificacao_proto_rawDesc), len(file_palpitearena_notificacao_v1_notificacao_proto_rawDesc)))
	})
	return file_palpitearena_notificacao_v1_notificacao_proto_rawDescData
}

var file_palpitearena_notificacao_v1_notificacao_proto_msgTypes = make([]protoimpl.MessageInfo, 2)
var file_palpitearena_notificacao_v1_notificacao_proto_goTypes = []any{
	(*NotificarResultadoPalpiteRequest)(nil),  // 0: palpitearena.notificacao.v1.NotificarResultadoPalpiteRequest
	(*NotificarResultadoPalpiteResponse)(nil), // 1: palpitearena.notificacao.v1.NotificarResultadoPalpiteResponse
}
var file_palpitearena_notificacao_v1_notificacao_proto_depIdxs = []int32{
	0, // 0: palpitearena.notificacao.v1.NotificacaoService.NotificarResultadoPalpite:input_type -> palpitearena.notificacao.v1.NotificarResultadoPalpiteRequest
	1, // 1: palpitearena.notificacao.v1.NotificacaoService.NotificarResultadoPalpite:output_type -> palpitearena.notificacao.v1.NotificarResultadoPalpiteResponse
	1, // [1:2] is the sub-list for method output_type
	0, // [0:1] is the sub-list for method input_type
	0, // [0:0] is the sub-list for extension type_name
	0, // [0:0] is the sub-list for extension extendee
	0, // [0:0] is the sub-list for field type_name
}

func init() { file_palpitearena_notificacao_v1_notificacao_proto_init() }
func file_palpitearena_notificacao_v1_notificacao_proto_init() {
	if File_palpitearena_notificacao_v1_notificacao_proto != nil {
		return
	}
	type x struct{}
	out := protoimpl.TypeBuilder{
		File: protoimpl.DescBuilder{
			GoPackagePath: reflect.TypeOf(x{}).PkgPath(),
			RawDescriptor: unsafe.Slice(unsafe.StringData(file_palpitearena_notificacao_v1_notificacao_proto_rawDesc), len(file_palpitearena_notificacao_v1_notificacao_proto_rawDesc)),
			NumEnums:      0,
			NumMessages:   2,
			NumExtensions: 0,
			NumServices:   1,
		},
		GoTypes:           file_palpitearena_notificacao_v1_notificacao_proto_goTypes,
		DependencyIndexes: file_palpitearena_notificacao_v1_notificacao_proto_depIdxs,
		MessageInfos:      file_palpitearena_notificacao_v1_notificacao_proto_msgTypes,
	}.Build()
	File_palpitearena_notificacao_v1_notificacao_proto = out.File
	file_palpitearena_notificacao_v1_notificacao_proto_goTypes = nil
	file_palpitearena_notificacao_v1_notificacao_proto_depIdxs = nil
}
