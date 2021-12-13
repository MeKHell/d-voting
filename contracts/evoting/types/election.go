package types

import (
	"encoding/binary"
	"go.dedis.ch/kyber/v3"
	"golang.org/x/xerrors"
	"math/rand"
)

type ID string

type status uint16

const (
	Initial         status = 0
	Open            status = 1
	Closed          status = 2
	ShuffledBallots status = 3
	// DecryptedBallots = 4
	ResultAvailable status = 5
	Canceled        status = 6
)

// Election contains all information about a simple election
type Election struct {
	Configuration Configuration

	// ElectionID is the hex-encoded SHA256 of the transaction ID that creates
	// the election
	ElectionID string

	AdminID string
	Status  status // Initial | Open | Closed | Shuffling | Decrypting
	Pubkey  []byte

	// BallotSize represents the total size of one ballot. It is used to pad
	// smaller ballots such that all  ballots cast have the same size
	BallotSize int

	// PublicBulletinBoard is a map from User ID to their ballot EncryptedBallot
	PublicBulletinBoard PublicBulletinBoard

	// ShuffleInstances is all the shuffles, along with their proof and identity
	// of shuffler.
	ShuffleInstances []ShuffleInstance

	// ShuffleThreshold is set based on the roster. We save it so we don't have
	// to compute it based on the roster each time we need it.
	ShuffleThreshold int

	DecryptedBallots []Ballot

	// roster is once set when the election is created based on the current
	// roster of the node stored in the global state. The roster won't change
	// during an election and will be used for DKG and Neff. Its type is
	// authority.Authority.
	RosterBuf []byte
}

// RandomVector is a slice of kyber.Scalar (encoded) which is used to prove
// and verify the proof of a shuffle
type RandomVector [][]byte

func (r RandomVector) UnMarshal() ([]kyber.Scalar, error) {
	e := make([]kyber.Scalar, len(r))

	for i, v := range r {
		scalar := suite.Scalar().Pick(suite.RandomStream())
		err := scalar.UnmarshalBinary(v)
		if err != nil {
			return nil, xerrors.Errorf("cannot unmarshall election random vector: %v", err)
		}
		e[i] = scalar
	}

	return e, nil
}

func (r *RandomVector) LoadFromScalars(e []kyber.Scalar) error {
	*r = make([][]byte, len(e))

	for i, scalar := range e {
		v, err := scalar.MarshalBinary()
		if err != nil {
			return xerrors.Errorf("could not marshal random vector: %v", err)
		}
		(*r)[i] = v
	}

	return nil
}

// SemiRandomStream implements cipher.Stream
type SemiRandomStream struct {
	// Seed is the seed on which should be based our random number generation
	seed []byte

	stream *rand.Rand
}

func NewSemiRandomStream(seed []byte) (SemiRandomStream, error) {
	if len(seed) > 8 {
		seed = seed[0:8]
	}

	s, n := binary.Varint(seed)
	if n <= 0 {
		return SemiRandomStream{}, xerrors.Errorf("the seed has a wrong size (too small)")
	}

	source := rand.NewSource(s)

	stream := rand.New(source)

	return SemiRandomStream{stream: stream, seed: seed}, nil
}

func (s SemiRandomStream) XORKeyStream(dst, src []byte) {
	key := make([]byte, len(src))

	_, err := s.stream.Read(key)
	if err != nil {
		panic("error reading into semi random stream :" + err.Error())
	}

	xof := suite.XOF(key)
	xof.XORKeyStream(dst, src)
}

// ShuffleInstance is an instance of a shuffle, it contains the shuffled ballots,
// the proofs and the identity of the shuffler.
type ShuffleInstance struct {
	// ShuffledBallots contains the list of shuffled ciphertext for this round
	ShuffledBallots EncryptedBallots

	// ShuffleProofs is the proof of the shuffle for this round
	ShuffleProofs []byte

	// ShufflerPublicKey is the key of the node who made the given shuffle.
	ShufflerPublicKey []byte
}

// Configuration contains the configuration of a new poll.
type Configuration struct {
	MainTitle string
	Scaffold  []Subject
}

// MaxBallotSize returns the maximum number of bytes required to store a ballot
func (c *Configuration) MaxBallotSize() int {
	size := 0
	for _, subject := range c.Scaffold {
		size += subject.MaxEncodedSize()
	}
	return size
}

// GetQuestion finds the question associated to a given ID and returns it
func (c *Configuration) GetQuestion(ID ID) Question {
	for _, subject := range c.Scaffold {
		question := subject.GetQuestion(ID)

		if question != nil {
			return question
		}
	}

	return nil
}

// IsValid returns true if and only if the whole configuration is coherent and
// valid
func (c *Configuration) IsValid() bool {
	// serves as a set to check each ID is unique
	uniqueIDs := make(map[ID]bool)

	for _, subject := range c.Scaffold {
		if !subject.IsValid(uniqueIDs) {
			return false
		}
	}

	return true
}

// PublicBulletinBoard maintains a list of encrypted ballots with the associated
// user ID.
type PublicBulletinBoard struct {
	UserIDs []string
	Ballots EncryptedBallots
}

// CastVote updates a user's vote or add a new vote and its associated user.
func (p *PublicBulletinBoard) CastVote(userID string, encryptedVote EncryptedBallot) {
	for i, u := range p.UserIDs {
		if u == userID {
			p.Ballots[i] = encryptedVote
			return
		}
	}

	p.UserIDs = append(p.UserIDs, userID)
	p.Ballots = append(p.Ballots, encryptedVote.Copy())
}

// GetBallotFromUser returns the ballot associated to a user. Returns nil if
// user is not found.
func (p *PublicBulletinBoard) GetBallotFromUser(userID string) (EncryptedBallot, bool) {
	for i, u := range p.UserIDs {
		if u == userID {
			return p.Ballots[i].Copy(), true
		}
	}

	return EncryptedBallot{}, false
}

// DeleteUser removes a user and its associated votes if found.
func (p *PublicBulletinBoard) DeleteUser(userID string) bool {
	for i, u := range p.UserIDs {
		if u == userID {
			p.UserIDs = append(p.UserIDs[:i], p.UserIDs[i+1:]...)
			p.Ballots = append(p.Ballots[:i], p.Ballots[i+1:]...)
			return true
		}
	}

	return false
}

// EncryptedBallot represents a list of Ciphertext
type EncryptedBallot []Ciphertext

// EncryptedBallots represents a list of EncryptedBallot
type EncryptedBallots []EncryptedBallot

// GetElGPairs returns 2 dimensional arrays with the Elgamal pairs of each encrypted ballot
func (b EncryptedBallots) GetElGPairs() ([][]kyber.Point, [][]kyber.Point, error) {
	if len(b) == 0 {
		return nil, nil, xerrors.Errorf("there are no ballots")
	}

	ballotSize := len(b[0])

	X := make([][]kyber.Point, ballotSize)
	Y := make([][]kyber.Point, ballotSize)

	for _, ballot := range b {
		x, y, err := ballot.GetElGPairs()
		if err != nil {
			return nil, nil, err
		}

		for i := 0; i < len(x); i++ {
			X[i] = append(X[i], x[i])
			Y[i] = append(Y[i], y[i])
		}
	}

	return X, Y, nil
}

func (b *EncryptedBallots) InitFromElGPairs(X, Y [][]kyber.Point) error {
	if len(X) != len(Y) {
		return xerrors.Errorf("X and Y must have same length: %d != %d",
			len(X), len(Y))
	}

	if len(X) == 0 {
		return xerrors.Errorf("El Gamal pairs are empty")
	}

	NQ := len(X)
	k := len(X[0])
	*b = make([]EncryptedBallot, k)

	for i := 0; i < k; i++ {
		x := make([]kyber.Point, NQ)
		y := make([]kyber.Point, NQ)

		for j := 0; j < NQ; j++ {
			x[j] = X[j][i]
			y[j] = Y[j][i]
		}

		encryptedBallot := EncryptedBallot{}
		err := encryptedBallot.InitFromElGPairs(x, y)
		if err != nil {
			return err
		}

		(*b)[i] = encryptedBallot
	}

	return nil
}

// GetElGPairs returns corresponding kyber.Points from the ciphertexts
func (b EncryptedBallot) GetElGPairs() (ks []kyber.Point, cs []kyber.Point, err error) {
	ks = make([]kyber.Point, len(b))
	cs = make([]kyber.Point, len(b))

	for i, ct := range b {
		k, c, err := ct.GetPoints()
		if err != nil {
			return nil, nil, xerrors.Errorf("failed to get points: %v", err)
		}

		ks[i] = k
		cs[i] = c
	}

	return ks, cs, nil
}

// Copy returns a deep copy of EncryptedBallot
func (b EncryptedBallot) Copy() EncryptedBallot {
	ciphertexts := make([]Ciphertext, len(b))

	for i, ciphertext := range b {
		ciphertexts[i] = ciphertext.Copy()
	}

	return ciphertexts
}

// InitFromElGPairs sets the ciphertext based on ks, cs
func (b *EncryptedBallot) InitFromElGPairs(ks []kyber.Point, cs []kyber.Point) error {
	if len(ks) != len(cs) {
		return xerrors.Errorf("ks and cs must have same length: %d != %d",
			len(ks), len(cs))
	}

	*b = make([]Ciphertext, len(ks))

	for i := range ks {
		var ct Ciphertext

		err := ct.FromPoints(ks[i], cs[i])
		if err != nil {
			return xerrors.Errorf("failed to init ciphertext: %v", err)
		}

		(*b)[i] = ct
	}

	return nil
}
