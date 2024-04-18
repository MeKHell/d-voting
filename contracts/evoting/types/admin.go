package types

import (
	"encoding/hex"
	"go.dedis.ch/dela/core/store"
	"go.dedis.ch/dela/serde"
	"go.dedis.ch/dela/serde/registry"
	"golang.org/x/xerrors"
	"strconv"
)

var adminFormFormat = registry.NewSimpleRegistry()

func RegisterAdminFormFormat(format serde.Format, engine serde.FormatEngine) {
	adminFormFormat.Register(format, engine)
}

type AdminForm struct {
	// FormID is the hex-encoded SHA265 of the Tx ID that creates the form
	FormID string

	// List of SCIPER with admin rights
	AdminList []int
}

func (af AdminForm) Serialize(ctx serde.Context) ([]byte, error) {
	format := adminFormFormat.Get(ctx.GetFormat())

	data, err := format.Encode(ctx, af)
	if err != nil {
		return nil, xerrors.Errorf("Failed to encode AdminForm: %v", err)
	}

	return data, nil
}

func (af AdminForm) Deserialize(ctx serde.Context, data []byte) (serde.Message, error) {
	format := adminFormFormat.Get(ctx.GetFormat())

	message, err := format.Decode(ctx, data)
	if err != nil {
		return nil, xerrors.Errorf("Failed to decode: %v", err)
	}

	return message, nil
}

// AddAdmin add a new admin to the system.
func (af *AdminForm) AddAdmin(userID string) error {
	sciperInt, err := strconv.Atoi(userID)
	if err != nil {
		return xerrors.Errorf("Failed to convert SCIPER to an INT: %v", err)
	}

	af.AdminList = append(af.AdminList, sciperInt)

	return nil
}

// IsAdmin return the index of admin if userID is one, else return -1
func (af *AdminForm) IsAdmin(userID string) int {
	sciperInt, err := strconv.Atoi(userID)
	if err != nil {
		return -1
	}

	for i := 0; i < len(af.AdminList); i++ {
		if af.AdminList[i] == sciperInt {
			return i
		}
	}

	return -1
}

// RemoveAdmin add a new admin to the system.
func (af *AdminForm) RemoveAdmin(userID string) error {
	_, err := strconv.Atoi(userID)
	if err != nil {
		return xerrors.Errorf("Failed to convert SCIPER to an INT: %v", err)
	}

	index := af.IsAdmin(userID)

	if index < 0 {
		return xerrors.Errorf("Error while retrieving the index of the element.")
	}

	af.AdminList = append(af.AdminList[:index], af.AdminList[index+1:]...)
	return nil
}

func AdminFormFromStore(ctx serde.Context, adminFormFac serde.Factory, adminFormIDHex string, store store.Readable) (AdminForm, error) {
	adminForm := AdminForm{}

	adminFormIDBuf, err := hex.DecodeString(adminFormIDHex)
	if err != nil {
		return adminForm, xerrors.Errorf("Failed to decode adminFormIDHex: %v", err)
	}

	adminFormBuf, err := store.Get(adminFormIDBuf)
	if err != nil {
		return adminForm, xerrors.Errorf("While getting data for form: %v", err)
	}
	if len(adminFormBuf) == 0 {
		return adminForm, xerrors.Errorf("No form found")
	}

	message, err := adminFormFac.Deserialize(ctx, adminFormBuf)
	if err != nil {
		return adminForm, xerrors.Errorf("While deserializing: %v", err)
	}

	adminForm, ok := message.(AdminForm)
	if !ok {
		return adminForm, xerrors.Errorf("Wrong message type: %T", message)
	}

	return adminForm, nil
}
