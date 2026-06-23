---
title: "Reverse Engineering Integrity Checks"
date: 2026-06-13 12:00:00 +0000
---

# -Introduction

#### Disclaimer
I did all of this out of curiosity and to test myself on something real for once,i do not plan on giving any clues to reversing the licensing system which is **[very hard]** to bypass? i guess we will never know?

Hello guys,
Back again with a unique real revers engineering example,and this time its a real world example which is a tool called [MiniTool Partition Wizard](https://www.partitionwizard.com/), its a comprehensive disk and partition management software for Windows.


# -Analysis

if have you ever decided to modify the partitionwizard.dll or other files that we will be listing later the program will prompt you with an invalid configure file error when trying to apply operations or opening the program,there are about 3 issues related to this.
the first one is failing to find the configuration file that contains info which is the `partitionwizard.exe.mfh`, the name is tricky but it does check more than the exe as of right now we will trace the first Integrity Check where it checks if the file exists or not.

![Error Showcase](/assets/images/reverse-engineering-integrity-checks-images-1781316994379_image.webp){: width="40%"}

fortunately this program doesn't have any encryption inside of it which makes it easier to trace where the string is located at

# -Static Analysis

```cpp
failed_to_load:
  is_initialized = v55 == 0;
  QString::~QString(&v191);
  QString::~QString(v238);
  if ( is_initialized )
  {
    v58 = QObject::tr(v234, "MiniTool Partition Wizard", 0, 0xFFFFFFFFLL);
    v59 = QObject::tr(v206, "Failed to load configure file.", 0, 0xFFFFFFFFLL);
    LOBYTE(v60) = 32;
    LOWORD(v124) = *(_WORD *)QChar::QChar(v156, v60);
    LODWORD(v59) = QString::arg(v59, v224, v58, 0, v124);
    v61 = QObject::tr(v204, "Error", 0, 0xFFFFFFFFLL);
    v199 = 1024;
    sub_1800040CA(0, v61, v59, 1024, 1024);
    QString::~QString(v204);
    QString::~QString(v224);
    QString::~QString(v206);
    QString::~QString(v234);
```
we can see that we are checking the boolean is_initialized which determines whether the file was parsed or loaded successfully.
so the first thing we'd want to do is to find where the file is opened and luckily its very easy to indentify it
```cpp
  v31 = (QString *)QCoreApplication::applicationFilePath(v238);
  file_path = j_get_file_path_by_extension((QString *)&v191, v31, ".mfh");
  QFile::QFile((QFile *)mfh_Qt_file, file_path);
  v215 = 1;
  if ( !(unsigned __int8)QFile::open(mfh_Qt_file, 1) )
    goto failed_to_open_file;
  QIODevice::readAll(mfh_Qt_file, &mfh_file_buffer);
  if ( (unsigned __int64)mfh_file_buffer.QByteArr->size <= 0x10
    || (v33 = QByteArray::data(&mfh_file_buffer), *(_QWORD *)v33 != 0x4A43BF76CAA6490ELL)
    || *((_DWORD *)v33 + 2) != 0x168F32B2 )     // validate signature
  {
invalid_mfh_signature:
    QByteArray::~QByteArray(&mfh_file_buffer);
failed_to_open_file:
    QFile::~QFile((QFile *)mfh_Qt_file);
    v55 = 0;
    goto failed_to_load;
  }
```
aha there we go so if the file doesn't exist or if it misses the correct signature it will tell us that it failed to load it, okay so that means we can just put make a file with that signature? no that doesn't work because that was just the initial check
going down a little we find a lot of interesting code,since the code is too big we will divide into chunks to analyze one by one

```cpp
index = *((int *)QByteArray::data(&mfh_file_buffer) + 3);
  v162 = QString::fromAscii_helper((const char *)&qword_180291600, 2);
  LOBYTE(v35) = 32;
  LOWORD(v129) = *(_WORD *)QChar::QChar(v152, v35);
  mfh_index = QString::arg(&v162, v198, (index >> 1) | (index << 36), 0, 10, v129);
  v37 = QString::toLocal8Bit(mfh_index, &v209);
  QCryptographicHash::hash(&v141, v37, 0);
  QByteArray::~QByteArray(&v209);
  QString::~QString(v198);
  QString::~QString(&v162);
  v38 = QByteArray::data(&v141);
  j_fn_copy_arr(KeyTable, *(__int64 **)&v38[(int)index % 10]);
  QByteArray::remove(&mfh_file_buffer, 0, 16);
  v39 = QByteArray::QByteArray(&mfh_buffer_trimmed_1, &mfh_file_buffer);
  j_verify_check_sums((__int64 *)KeyTable, &decompressed_mfh, v39);
```
okay one thing to know is that from the previous code we know that the mfh contains a 96 bit long signature and then we parse specifically 32 bytes after that we do `(index >> 1) | (index << 36)`
then we convert that number to a [Qstring](https://doc.qt.io/qt-6/qstring.html) in base 10 once we do we convert that to to an 8 bit representation in [QByteArray](https://doc.qt.io/qt-6/qbytearray.html) which is then hashed using MD4 you can see the values corresponding to the algorithms [here](https://doc.qt.io/qt-6/qcryptographichash.html#Algorithm-enum), the only algorithms we will be using in this software are


|         Constant         | Value|
|--------------------------|------|
| QCryptographicHash::Md4  |  0   |
| QCryptographicHash::Md5  |  1   |
| QCryptographicHash::Sha1 |  2   |



after that we proceed to copy 8 bytes from the hashed array to the Key Table correct me if I'm wrong because i am learning just like you,we also remove specifically 16 bytes from the array using [ImHex](https://github.com/werwolv/imhex) we can produce a pattern file for the first 16 bytes and here it is

![](/assets/images/reverse-engineering-integrity-checks-images-1781316994383_image.webp){: width="100%"}

After all of this we call ```j_DecompressMfh``` where we pass in the trimmed mfh file with the KeyTable the second parameter is going to be the decompressed file and we will see how its decompressed.
Following into that function once again i will be splitting it into parts and skipping some that i consider useless
```
v38 = Qmfh_arr;
  v37 = out;
  v35 = -2;
  mfh_arr = Qmfh_arr;
  OUT = out;
  if ( chunk_1->arr.QByteArr->size )
  {
    QByteArray::QByteArray(&mfh_arr_2, Qmfh_arr);
    if ( mfh_arr->QByteArr->size < 3 )
    {
fail:
      QByteArray::QByteArray(OUT);
LABEL_26:
      QByteArray::~QByteArray(&mfh_arr_2);
      goto exit;
    }
    if ( QByteArray::at(&mfh_arr_2, 0) != 3 )   // version
    {
      LODWORD(chunk_1[1].arr.QByteArr) = 2;
      v8 = QMessageLogger::QMessageLogger((QMessageLogger *)&mfh_arr_4, nullptr, 0, nullptr);
      v9 = QMessageLogger::warning(v8, &mfh_arr_data_1);
      QDebug::operator<<(v9, "Invalid version or not a cyphertext.");
      QDebug::~QDebug((QDebug *)&mfh_arr_data_1);
      goto fail;
    }
```
alright this is interesting i already created some structure on IDA for us to understand it better - all we do is check the Key Table size and Check if the mfh size is under 3 and if you fail any of those the function will exit,the next thing it does is check the value at index 0 on our array and see if its equal to 3 which is the version number

![partitionwizard.exe.mfh](/assets/images/reverse-engineering-integrity-checks-images-1781316994383_image.webp){: width="100%"}
we can see that that it has the hardcoded version number 03

```cpp
    flag = QByteArray::at(&mfh_arr_2, 1);
    v11.QByteArr = QByteArray::mid(&mfh_arr_2, (unsigned int)&mfh_arr_data_1, 2).QByteArr;
    QByteArray::operator=(&mfh_arr_2, v11.QByteArr);
    QByteArray::~QByteArray((QByteArray *)&mfh_arr_data_1);
    i = 0;
    if ( mfh_arr_2.QByteArr->size > 0 )
    {
      previous_char = 0;
      size = mfh_arr_2.QByteArr->size;
      do
      {
        mfh_arr_4.QByteArr = (QByteArrayData *)&mfh_arr_2;
        v34 = i;
        v15 = QByteRef::operator char(&mfh_arr_4);
        v16 = (char *)chunk_1->arr.QByteArr + *(_QWORD *)&chunk_1->arr.QByteArr->offset_to_arr + (i & 7);
        v31.QByteArr = (QByteArrayData *)&mfh_arr_2;
        v32 = i;
        v17 = QByteArray::at(&mfh_arr_2, i);
        QByteRef::operator=(&v31, (unsigned __int8)(*v16 ^ previous_char ^ v17));
        previous_char = v15;
        ++i;
      }
      while ( i < size );
      OUT = v37;
      mfh_arr = v38;
    }
    mfh_arr_3.QByteArr = QByteArray::mid(&mfh_arr_2, (unsigned int)&mfh_arr_data_1, 1).QByteArr;
    QByteArray::operator=(&mfh_arr_2, mfh_arr_3.QByteArr);
    QByteArray::~QByteArray((QByteArray *)&mfh_arr_data_1);
```
we access the next byte which is also a hard coded 3 and that value might be different depending on the version or something we will see later on, after that we remove those 2 bytes and go on a for loop where we store the previous letter xored by Key Table at index i then we xor the next character by that and the loop keeps doing that till the end,so lets turn this into a more readable code

```cpp
  char previous_char = 0;
  for (int i{}; i < cut_mfh.length(); i++) {
    char old = cut_mfh[i];
    cut_mfh[i] ^= KeyTable[i & 7] ^ previous_char;
    previous_char = old;
  }
```
and that's all it does after we finish Deciphering the data we remove another byte from the array
``` 
mfh_arr_3.QByteArr = QByteArray::mid(&mfh_arr_2, (unsigned int)&mfh_arr_data_1, 1).QByteArr;
    QByteArray::operator=(&mfh_arr_2, mfh_arr_3.QByteArr);
    QByteArray::~QByteArray((QByteArray *)&mfh_arr_data_1);
    if ( (flag & 2) != 0 )
    {
      if ( mfh_arr_2.QByteArr->size < 2 )
      {
unequal_sum:
        LODWORD(chunk_1[1].arr.QByteArr) = 3;
        QByteArray::QByteArray(OUT);
        goto failed_to_verify_sum;
      }
      QDataStream::QDataStream(&mfh_arr_4, &mfh_arr_2, 1);// open in ReadOnly
      QDataStream::operator>>(&mfh_arr_4, &mfh_arr_data_1);
      QDataStream::~QDataStream((QDataStream *)&mfh_arr_4);
      v19.QByteArr = QByteArray::mid(&mfh_arr_2, (unsigned int)&v31, 2).QByteArr;
      QByteArray::operator=(&mfh_arr_2, v19.QByteArr);
      QByteArray::~QByteArray(&v31);
      v20 = mfh_arr_2.QByteArr->size;
      v21 = QByteArray::constData(&mfh_arr_2);
      v22 = qChecksum(v21, v20);
      v23 = v22 == (unsigned __int16)mfh_arr_data_1;
    }

```
now doing some dynamic analysis the current Minitool Wizard (13.6) will always go through the first check so i didn't bother reversing the rest.
it procceeds to pull the hard coded checksum from the mfh file and remove 2 bytes to calculate the checksum and compare if they are are equal or not,if they are not the function will exit and it wont the decompress the array which will result in failing to load the configuration file.
as i said i will be skipping the else statement but here it is if you want to check it out
```
else
    {
      if ( (flag & 4) == 0 )
        goto LABEL_23;
      if ( mfh_arr_2.QByteArr->size < 20 )
        goto maybe_recalculate_sum;
      QByteArray::left(&mfh_arr_2, (unsigned int)&v31);
      v24.QByteArr = QByteArray::mid(&mfh_arr_2, (unsigned int)&mfh_arr_4, 20).QByteArr;
      QByteArray::operator=(&mfh_arr_2, v24.QByteArr);
      QByteArray::~QByteArray(&mfh_arr_4);
      QCryptographicHash::QCryptographicHash(&mfh_arr_data_1, 2);
      QCryptographicHash::addData((QCryptographicHash *)&mfh_arr_data_1, &mfh_arr_2);
      v25.QByteArr = QCryptographicHash::result((QCryptographicHash *)&mfh_arr_data_1).QByteArr;
      v23 = false;
      if ( *(_DWORD *)(*(_QWORD *)&v25.QByteArr->ref + 4LL) == v31.QByteArr->size )
      {
        v26 = *(int *)(*(_QWORD *)&v25.QByteArr->ref + 4LL);
        v27 = QByteArray::constData(&v31);
        v28 = QByteArray::constData((QByteArray *)v25.QByteArr);
        if ( !memcmp(v28, v27, v26) )
          v23 = true;
      }
      QByteArray::~QByteArray(&mfh_arr_4);
      QCryptographicHash::~QCryptographicHash((QCryptographicHash *)&mfh_arr_data_1);
      QByteArray::~QByteArray(&v31);
    }
```
after going through one of those we decompress the actual file
```
if ( !v23 )
      goto unequal_sum;
LABEL_23:
    if ( (flag & 1) != 0 )
    {
      v29 = (__int64)j_uncompress_data((const unsigned __int8 *)&mfh_arr_data_1, &mfh_arr_2);
      QByteArray::operator=(&mfh_arr_2, v29);
      QByteArray::~QByteArray((QByteArray *)&mfh_arr_data_1);
    }
    LODWORD(chunk_1[1].arr.QByteArr) = 0;
    QByteArray::QByteArray(OUT, &mfh_arr_2);
    goto Success;
  }
```
now we will build our code to the decompress the file for us and here it is

```
auto DecompressMfhFile(char *KeyTable, QByteArray &mfh) {
  mfh.remove(0, 16);

  auto version = mfh.at(0);
  auto version2 = mfh.at(1);

  auto cut_mfh = mfh.mid(2);

  QByteArray DeCompressed_mfh;

  char previous_char = 0;
  for (int i{}; i < cut_mfh.length(); i++) {
    char old = cut_mfh[i];
    cut_mfh[i] ^= KeyTable[i & 7] ^ previous_char;
    previous_char = old;
  }

  cut_mfh = cut_mfh.mid(1);

  bool checksumCondition;
  if ((version & 2) != 0) {
    QDataStream Qdata(&cut_mfh, QIODeviceBase::ReadOnly);
    quint16 check_sum_1;
    Qdata >> check_sum_1;
    cut_mfh = cut_mfh.mid(2); // art
    auto check_sum_2 = qChecksum(QByteArrayView(cut_mfh));

    checksumCondition = check_sum_1 == check_sum_2;
  } else
    std::println("Failed and this falls back to something else didnt finish");
  if (checksumCondition == false)
    exit(1);

  if ((version & 1) != 0)
    DeCompressed_mfh = qUncompress(cut_mfh);
  uint16_t checksum = qChecksum(qCompress(DeCompressed_mfh, -1));

  return DeCompressed_mfh;
}
```
the code works and it decrypts the mfh file correctly and after we return the decompressed we insert 16 bytes,guess what thats our signature

![](/assets/images/reverse-engineering-integrity-checks-images-1781316994383_image.webp){: width="100%"}

and we can already notice that the decrypted file contains the list of files that are checked we are probably already going to assume that whats under the name of the files are the generated hashes great!!

after we insert the 16 bytes signature this comes after

```
if ( !decompressed_mfh.QByteArr->size )
    goto invalid_array_size;
  QByteArray::insert(&decompressed_mfh, 0, (const char *)&qword_180A43430, 16);
  v40 = *((_OWORD *)QByteArray::data(&decompressed_mfh) + 1);
  v257 = v40;
  v41 = QByteArray::data(&decompressed_mfh);
  *((_QWORD *)v41 + 2) = 0;
  *((_QWORD *)v41 + 3) = 0;
  v42 = QCryptographicHash::hash(&v200, &decompressed_mfh, 2);
  v43 = QCryptographicHash::hash(&v211, v42, 1);
  QByteArray::operator=(&v139, v43);
  QByteArray::~QByteArray(&v211);
  QByteArray::~QByteArray(&v200);
  v44 = QByteArray::data(&v139);
  if ( *(_OWORD *)v44 != __PAIR128__(*((unsigned __int64 *)&v257 + 1), v40) )
  {
invalid_array_size:
    QByteArray::~QByteArray(&decompressed_mfh);
    QByteArr = (struct QArrayData *)chunk_1[0].arr.QByteArr;
    if ( chunk_1[0].arr.QByteArr->ref )
    {
      if ( chunk_1[0].arr.QByteArr->ref == -1 || _InterlockedDecrement(&chunk_1[0].arr.QByteArr->ref) )
        goto invalid_atomic_ref;
      QByteArr = (struct QArrayData *)chunk_1[0].arr.QByteArr;
    }
    QArrayData::deallocate(QByteArr, 1u, 8u);
invalid_atomic_ref:
    QByteArray::~QByteArray(&v141);
    goto invalid_mfh_signature;
  }
```
you probably already guessed from the previous picture that we are comparing a hard coded hash of our decompressed file with the calculated one and the program does null the hard coded to generate the correct one,put that in mind because we will need this later.
next we go onto this very big loop
```
 v45 = *((_DWORD *)QByteArray::data(&decompressed_mfh) + 8);
  OffsetToData = 36;
  if ( v45 > 0 )
  {
    OffsetToEntry = 36;
    i = (unsigned int)v45;
    do
    {
      QString::QString(FileName);
      *(_QWORD *)&QList_1.list.ref = QListData::shared_null;
      memset(Str, 0, 255);
      LODWORD(v182) = *(_DWORD *)&QByteArray::data(&decompressed_mfh)[OffsetToEntry];
      val = OffsetToEntry + 4;
      decompresed = QByteArray::data(&decompressed_mfh);
      Str[0] = *(_OWORD *)&decompresed[val];
      Str[1] = *(_OWORD *)&decompresed[val + 16];
      Str[2] = *(_OWORD *)&decompresed[val + 32];
      Str[3] = *(_OWORD *)&decompresed[val + 48];
      Str[4] = *(_OWORD *)&decompresed[val + 64];
      Str[5] = *(_OWORD *)&decompresed[val + 80];
      Str[6] = *(_OWORD *)&decompresed[val + 96];
      Str[7] = *(_OWORD *)&decompresed[val + 112];
      Str[8] = *(_OWORD *)&decompresed[val + 128];
      Str[9] = *(_OWORD *)&decompresed[val + 144];
      Str[10] = *(_OWORD *)&decompresed[val + 160];
      Str[11] = *(_OWORD *)&decompresed[val + 176];
      Str[12] = *(_OWORD *)&decompresed[val + 192];
      Str[13] = *(_OWORD *)&decompresed[val + 208];
      Str[14] = *(_OWORD *)&decompresed[val + 224];
      *(_QWORD *)&Str[15] = *(_QWORD *)&decompresed[val + 240];
      DWORD2(Str[15]) = *(_DWORD *)&decompresed[val + 248];
      WORD6(Str[15]) = *(_WORD *)&decompresed[val + 252];
      BYTE14(Str[15]) = decompresed[val + 254];
      OffsetToData += 259;
      QString::operator=(FileName, Str);
      j = 10;
      OffsetToEntry = val + 455;
      do
      {
        v52 = QByteArray::data(&decompressed_mfh);
        QByteArray::fromRawData(&v160, &v52[OffsetToData], 20);
        OffsetToData += 20;
        v53 = QByteArray::toHex(&v160, &v213);
        QCryptographicHash::hash(&v164, v53, 0);
        QByteArray::~QByteArray(&v213);
        j_append_Qarray_to_QList(&QList_1, &v164);
        QByteArray::~QByteArray(&v164);
        QByteArray::~QByteArray(&v160);
        --j;
      }
      while ( j );
      sub_18000A533(&QFile_List, (__int64)&v182);
      j_Qlist_Destructor((struct QListData::Data **)&QList_1);
      QString::~QString(FileName);
      --i;
    }
    while ( i );
  }

```
but dont let it scare you because it holds a very big lie because all we are doing on the first part is getting the file name,we can conclude that we are looping through entries
you might be asking how i knew that the first half only grabs the name,thats through dynamic analysis

![](/assets/images/reverse-engineering-integrity-checks-images-1781316994384_image.webp){: width="100%"}
specifically this part where ida had missed it out

```
lea rcx, [rax+rsi]
lea rdx, [rbp+4D0h+Str]
```

![](/assets/images/reverse-engineering-integrity-checks-images-1781316994384_image.webp){: width="100%"}

you can clearly see in ida that rcx points to the filename and notice how the filename is located at offset + 4 from our structure because remember the OffsetToEntry that is the size of the entry header
![](/assets/images/reverse-engineering-integrity-checks-images-1781316994385_image.webp){: width="100%"}

so the entry header contains the number of entries or the amount of files and we can already gussed some of the structure
notice how we also add 459 (455 + 4) to the Entry that means that each Entry is 459 bytes in size and more clues is that we add 259 which is an offset to the list of data.
then we loop 10 times and grab 20 bytes through this information we know that our data array has to be a multiple of 20 exactly which if you notice our structure guess thats correct those hashes are then pushed to a qlist and finnaly after of all that we will push the file name and file hash array to a qlist our guess Entry structure is

```
struct Entry {
  uint32_t file_size;
  char FileName[255];
  char HashedData[200];
};
```

lets try writing a pattern file for our decompressed file and look at the result

![](asset:img_1781323463050){: width="100%"}

very great this means we fully understood the integrity check because thats all it does though on other checks there are more steps which i didnt bother going into but we do understood the logic:

- The Configuration file starts with a signature.
- The Configuration file contains a ciphered and compressed data which is of basically a list of entries.
- we hardcode the checksum of the compressed data checksum and recalculate it to check if its correct.
- The Decompressed Block contains a 16 byte signature and MD4 128 bit hash value of the entries.

im going to assume that the program compares the current modules hashes with the ones that are located at the entry which causes the integrity check.


# -Writing a parser and a generator
so i wrote both and i realized that if you can generate an empty Entry file then that means the program will not check for any files which bypasses the integrity check

https://github.com/hazouka/MiniTool-Partition-Wizard-Integrity-Check


# -End

I hope that this was helpful,the main purpose of this post was to understand integrity checks in general ,your more than welcome to put suggetions on how can i improve at writing because i feel like im not being as much as detailed but i tried.

> I was writing at the night, now its the morning..