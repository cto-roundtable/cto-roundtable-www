<template>
  <div>
    <div
      v-for="member in members"
      :key="member.name"
    >
      <v-hover>
        <template #default="{ hover }">
          <v-card
            class="mx-auto mb-6"
            color="white"
          >
            <v-card-title>
              <v-list-item-avatar width="60" height="60">
                <v-img
                  :alt="member.name"
                  :src="member.photoUrl ? member.photoUrl : 'https://avataaars.io/?avatarStyle=Transparent&topType=ShortHairShortCurly&accessoriesType=Prescription02&hairColor=Black&facialHairType=Blank&clotheType=Hoodie&clotheColor=White&eyeType=Default&eyebrowType=DefaultNatural&mouthType=Default&skinColor=Light'"
                />
              </v-list-item-avatar>
              <div class="text-h6" style="line-height: 24px">
                <b>{{ member.name }}</b>
                <br>
                <small>{{ member.role }}</small>
              </div>
            </v-card-title>

            <v-card-text>
              {{ member.description }}
            </v-card-text>

            <v-card-subtitle v-if="member.expertise">
              <small class="grey--text"><b>{{ member.name.split(" ")[0] }} is an expert in</b> {{ member.expertise }}</small>
            </v-card-subtitle>

            <v-fade-transition>
              <v-overlay
                v-if="hover"
                absolute
                color="#036358"
              >
                <v-card-actions>
                  <v-list>
                    <v-list-item v-if="member.url" class="grow" @click="openUrl(member.url)">
                      <v-list-item-content>
                        <v-list-item-title>
                          <v-icon>mdi-open-in-new</v-icon>
                          {{ member.url.split('://')[1] }}
                        </v-list-item-title>
                      </v-list-item-content>
                    </v-list-item>

                    <v-list-item v-if="member.twitter" class="grow" @click="openUrl(member.twitter)">
                      <v-list-item-content>
                        <v-list-item-title>
                          <v-icon>mdi-twitter</v-icon>
                          {{ member.twitter.split('com/')[1] }}
                        </v-list-item-title>
                      </v-list-item-content>
                    </v-list-item>

                    <v-list-item v-if="member.linkedIn" class="grow" @click="openUrl(member.linkedIn)">
                      <v-list-item-content>
                        <v-list-item-title>
                          <v-icon>mdi-linkedin</v-icon>
                          {{ member.linkedIn.split('in/')[1] }}
                        </v-list-item-title>
                      </v-list-item-content>
                    </v-list-item>
                  </v-list>
                </v-card-actions>
              </v-overlay>
            </v-fade-transition>
          </v-card>
        </template>
      </v-hover>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'Members',
  data () {
    return {
      members: [
        {
          description: 'Axel has been working across the stack with backend, web and mobile platforms, and has extensive experiences building delightful consumer products. Having grown the technology organisation from 2 to 30+ team members, Axel has considerable experience in optimising collaboration and teamwork in a growing organisation. As co-founder he has been involved in most parts of the Tise journey, and is keen to employ that knowledge and pay it forward to upcoming ventures. Having been part of the "startup scene" since 2015 he has a strong network both within the startup and investor ecosystem in Norway and the Nordics.',
          expertise: 'AWS, Mobile, Scaling organisations, Infrastructure, Product development, Product Management, stakeholder communication, product culture',
          linkedIn: 'https://www.linkedin.com/in/axelnaess',
          name: 'Axel Franck Næss',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C4E03AQFyjZY_fxnbqw/profile-displayphoto-shrink_800_800/0/1629966074919?e=1658361600&v=beta&t=J6TblJbvZzL3bv2kOD46fM9F5fLnq3Uu9gtcAVV_wx4',
          role: 'Co-founder & CTO/CPO, Tise',
          twitter: 'https://twitter.com/erikaxel',
          url: 'https://tise.com'
        },
        {
          description: 'Erik Axel has a strong interest in how to go to marked quickly in a startup and how to support this goal with the right technical choices. Previously he worked at McKinsey where he worked across multiple industries but focusing on banking & insurance',
          expertise: 'Software engineering, Product development, Ruby on Rails',
          linkedIn: 'https://www.linkedin.com/in/erikaxel',
          name: 'Erik Axel Nielsen',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C5103AQFKVu_0XT5xXw/profile-displayphoto-shrink_800_800/0/1516253352014?e=1658361600&v=beta&t=JXiljrT79aL3zxQqc85NAa_A80BkxlSh9EZCba3X92s',
          role: 'Co-founder & CTO, Luca Regnskap',
          twitter: '',
          url: 'https://www.lucaregnskap.no'
        },
        {
          description: 'Unacast are building data products for the US and global markets. Frode has been part of the Unacast journey since pre-revenue to its now global leading positions within location and human mobility data. His background is within software engineering with a broad rather than deep expertise profile. As a technology leader his strengths are more product and opportunity oriented, than management and operations.',
          expertise: 'Data products, B2B, Cloud & software engineering, Product culture & management, Scaling product and tech org, b2b startup/scaleup leadership ',
          linkedIn: 'https://www.linkedin.com/in/frodebjerke',
          name: 'Frode Tobias Bjerke',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C4D03AQHpB0a8cHHBwA/profile-displayphoto-shrink_800_800/0/1516816263712?e=1658361600&v=beta&t=2J3vbJhuvhS_Btswx13DBtNjB3LX0iCNUtGA85dqX4A',
          role: 'CTO, Unacast',
          twitter: '',
          url: 'https://www.unacast.com'
        },
        {
          description: 'Gard is an engineer with manager experience. He has been working on making it as easy, fast and reliable as possible for developers to get their code from commit to production.\nGard loves to hear about and discuss how different companies are handling their infrastructure and services.',
          expertise: 'AWS, spinnaker, CI, artifact management, feature toggles, leadership, strategy, support, oncall',
          linkedIn: 'https://www.linkedin.com/in/gard-rimestad',
          name: 'Gard Rimestad',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C5603AQGxK-i8QGbv3g/profile-displayphoto-shrink_800_800/0/1516248186498?e=1658361600&v=beta&t=7w2Su11mVjEMuCpTvf27CQwqjhK0imeibW6WaYABpvA',
          role: 'Engineering Manager, Unleash',
          twitter: '',
          url: 'https://www.getunleash.io'
        },
        {
          description: 'Gjermund is a full-stack software engineer, as well as being well-versed in building and leading software development teams. He is focusing mainly on Blockchain technology, especially in the Cosmos ecosystem.',
          expertise: 'Blockchain, GCP, DevOps, Software Architecture, Software Development',
          linkedIn: 'https://www.linkedin.com/in/bjaanes',
          name: 'Gjermund Bjaanes',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C4D03AQEGtfV7ttxABA/profile-displayphoto-shrink_800_800/0/1597497395611?e=1658361600&v=beta&t=BVDmIg4B1RJGzeOeExABooj2HCXZm8unnqhr0z8Whso',
          role: 'Co-founder & CTO, Empower',
          twitter: 'https://twitter.com/gjermundbjaanes',
          url: 'https://empower.eco'
        },
        {
          description: 'James is the CTO of Farmable, an Oslo-based agtech startup. He previously worked as the CTO and technical co-founder of Fjong, a high-end fashion rental platform. He has worked as a developer/tech lead in several other startups focusing on mobile finanace, app development, and 3d rendering.\nHe is a strong believer in open-source software and collaborative development, and maintains a few open-source projects in his spare time.',
          expertise: 'GCP, Kubernetes, Postgres/MySQL, Typescript',
          linkedIn: 'https://www.linkedin.com/in/james-larsen-a2985762',
          name: 'James Larsen',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C4D03AQEnEvYmOEl59g/profile-displayphoto-shrink_800_800/0/1623701118535?e=1658361600&v=beta&t=6SxuIaMReR1n6IYcYboYKB4hZyl6fn2RTxxQ1Suz8mA',
          role: 'CTO, Farmable',
          twitter: '',
          url: 'https://farmable.tech'
        },
        {
          description: 'Johannes is great at optimizing funnels, identifying and eliminating friction in software products, and running tight software development processes. He has done a few angel investments. He is a full-stack web developer and previously worked as IT Operations Manager.',
          expertise: 'Software Engineering, Conversion Rate Optimization, Product Development, User Experience, TypeScript, GCP, Vue',
          linkedIn: 'https://www.linkedin.com/in/johannesberggren',
          name: 'Johannes Berggren',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C4D03AQF74C-3wva0Eg/profile-displayphoto-shrink_800_800/0/1638103983588?e=1658361600&v=beta&t=FxVgZTWsKi29VluFIRpoQehV4OPiQgEvXjNu8CuKueY',
          role: 'Co-founder & CTO, Learnlink',
          twitter: 'https://twitter.com/JohsBerggren',
          url: 'https://johannesberggren.com'
        },
        {
          description: 'Ken is now an Engineering Manager at Oda. Previously he was the CTO of CrowdWorks. He has experience in building out technical and product teams, software architecture, and system design, and general engineering practices from multiple companies. Ken has a broad interest in both foundational technical challenges as well as applying technology to solve real problems.',
          expertise: 'Scaling engineering organizations, GCP, Software Architecture, System Designs, Software Development',
          linkedIn: 'https://www.linkedin.com/in/ken-gr%C3%B8nnbeck-0ab95924',
          name: 'Ken Grønnbeck',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C4D03AQEgQff5dNcS_Q/profile-displayphoto-shrink_800_800/0/1517237189705?e=1658361600&v=beta&t=fn-n-nsup1fVCr09qU_WLIMp469VExswZyAmncheO4Q',
          role: 'Engineering Manager, Oda',
          twitter: '',
          url: 'https://oda.com'
        },
        {
          description: 'Martin is the co-founder of Alvin and spends his time between Tallinn and Oslo. He previously built out the initial team, architecture and engineering practices as the techincal founding member in Unacast. Martin has also spent time in NYC, and is well connected with VCs in the Nordics, Europe and US.',
          expertise: 'Big Data, R&D, Technical writing, AWS/GCP',
          linkedIn: 'https://www.linkedin.com/in/martinsahlen',
          name: 'Martin Sahlen',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C4E03AQGCtHEoAoISCw/profile-displayphoto-shrink_800_800/0/1618472370085?e=1658361600&v=beta&t=sekIwaTwr2n07PVLygrx6id3vURA_RZW8HeevqoGuCY',
          role: 'Co-founder & CTO, Alvin.ai',
          twitter: 'https://twitter.com/MartinSahlen',
          url: 'https://www.alvin.ai'
        },
        {
          description: 'Nikolai is an experienced tech leader with positions at NRK, Finstart and several startups. He studied communication technology at NTNU.',
          expertise: '',
          linkedIn: 'https://www.linkedin.com/in/nikolai-hiring-heum-a3057144',
          name: 'Nikolai Heum',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C4D03AQGh-0DgJqb_sg/profile-displayphoto-shrink_800_800/0/1649193268577?e=1658361600&v=beta&t=iLZlEF7NK12CwnGBnS7zSkkIj2mWqT6W7msK5YQ5UHU',
          role: 'Co-founder & CTO, Enode',
          twitter: '',
          url: 'https://enode.io'
        },
        {
          description: 'Patrick is a co-founder and the CTO of Strise, a company he spun out of his Master thesis from NTNU in 2016. Today Strise is platform that fights financial crime with no-code and AI.\nIn addition to being a fullstack engineer and an avid technologist, Patrick also values people, and loves to make a point about the importance of a good company culture and proper core values in startups.',
          expertise: 'GCP, DevOps, Scala, Graph-technology, NLP, AI, company culture',
          linkedIn: 'https://www.linkedin.com/in/patrickskjennum',
          name: 'Patrick Skjennum',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C4E03AQEqmSJ7hDTHQQ/profile-displayphoto-shrink_800_800/0/1516489300052?e=1658361600&v=beta&t=kf_wNMOIjWz1jXJ44C3hJs5iACmYRkPFfnDKgULfrf0',
          role: 'Co-founder & CTO, Strise',
          twitter: '',
          url: 'https://www.strise.ai'
        },
        {
          description: 'Sindre was previously a co-founder and CTO of Mingl. He is a full stack engineer with a particular focus on product development and UX. Currently residing in Barcelona.',
          expertise: 'React, React Native, TypeScript, GCP, Architecture, Product Development',
          linkedIn: 'https://www.linkedin.com/in/sindre-seppola',
          name: 'Sindre Seppola',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C5603AQFLbpNYeJI8Ng/profile-displayphoto-shrink_800_800/0/1575542420248?e=1658361600&v=beta&t=Jyzb2tX5uyxBa8nr2_AnKnS0-BoFuoeFgDdmena8U7I',
          role: 'Senior Full Stack Engineer',
          twitter: 'https://twitter.com/sseppola',
          url: ''
        },
        {
          description: 'Snorre is a co-founder and CTO of Diwala. He has a global team across Africa and Asia working on the future of identity. He is currently residing in Norway Oslo as the only team member in Norway. He has a keen interest in blockchain and decentralization. And have connections to African, Norwegian and US investors',
          expertise: 'Blockchain, decentralization, GCP, Identity',
          linkedIn: 'https://www.linkedin.com/in/vongohren',
          name: 'Snorre Lothar von Gohren',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C4E03AQGqWYnxgn2peg/profile-displayphoto-shrink_800_800/0/1536248509588?e=1658361600&v=beta&t=0NDZlQEtrx4VXuc1zRTzKW_Kqr_Bdr-3-e5z036pIK8',
          role: 'Co-founder & CTO, Diwala',
          twitter: 'https://twitter.com/vongohren',
          url: 'https://www.diwala.io'
        },
        {
          description: 'Stian has an academic background in robotics, algorithms and machine learning. He belives well designed products and services, that solve real problems for real people, are far more impactful than fancy algorithms with doubtful use cases. Stian is allergic to consultants.',
          expertise: '',
          linkedIn: 'https://www.linkedin.com/in/stianlp',
          name: 'Stian Lind Petlund',
          photoUrl: 'https://media-exp1.licdn.com/dms/image/C4D03AQF0uNkolh2nhQ/profile-displayphoto-shrink_800_800/0/1575888440709?e=1658361600&v=beta&t=c_6FtPUTmFsPwwcmxkIGXY90crpS4o5UClcbY6rFxpc',
          role: 'Co-founder & CTO, Dagens',
          twitter: '',
          url: 'https://dagens.farm/'
        }
      ]
    }
  },
  methods: {
    openUrl (url: string): void {
      window.open(url, '_blank')
    }
  }
}
</script>
